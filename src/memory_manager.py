#!/usr/bin/env python3
"""
Conversation Memory and Context Manager for VoiceBot
Provides persistent memory across sessions with vector-based retrieval
"""

import json
import os
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
import logging
from dataclasses import dataclass, asdict
import pickle

import redis
from langchain.memory import ConversationSummaryBufferMemory, VectorStoreRetrieverMemory
from langchain.schema import BaseMessage, HumanMessage, AIMessage, SystemMessage
from langchain.embeddings import OpenAIEmbeddings
from langchain.vectorstores import Chroma
from langchain.chat_models import ChatOpenAI
import tiktoken

logger = logging.getLogger(__name__)

@dataclass
class ConversationTurn:
    """Single turn in a conversation"""
    timestamp: str
    role: str  # user, assistant, system, function
    content: str
    metadata: Dict[str, Any] = None
    function_calls: List[Dict] = None
    audio_transcript: str = None
    
@dataclass
class ConversationSession:
    """Complete conversation session with context"""
    session_id: str
    user_id: str
    started_at: str
    last_activity: str
    turns: List[ConversationTurn]
    context: Dict[str, Any]
    summary: str = ""
    entities: Dict[str, Any] = None
    workflow_state: Dict[str, Any] = None
    
class MemoryManager:
    """
    Manages conversation memory with multiple storage backends:
    - Short-term: Recent conversation in Redis
    - Long-term: Summarized history in vector DB
    - Context: User preferences, entities, workflow states
    """
    
    def __init__(self, redis_url: str = None, vector_db_path: str = "./data/memory_db"):
        """Initialize memory manager with storage backends"""
        
        # Redis for short-term memory
        self.redis_client = None
        if redis_url:
            try:
                self.redis_client = redis.from_url(redis_url)
                self.redis_client.ping()
                logger.info("Connected to Redis for session management")
            except Exception as e:
                logger.warning(f"Redis not available, using in-memory storage: {e}")
                self.redis_client = None
        
        # In-memory fallback
        self.memory_store = {}
        
        # Initialize OpenAI for embeddings and summarization
        self.embeddings = OpenAIEmbeddings(
            model="text-embedding-3-small"
        )
        
        self.llm = ChatOpenAI(
            model="gpt-4-turbo-preview",
            temperature=0
        )
        
        # Vector store for long-term memory
        os.makedirs(vector_db_path, exist_ok=True)
        self.vector_store = Chroma(
            embedding_function=self.embeddings,
            persist_directory=vector_db_path,
            collection_name="conversation_memory"
        )
        
        # LangChain memory components
        self.summary_memory = ConversationSummaryBufferMemory(
            llm=self.llm,
            max_token_limit=2000,
            return_messages=True
        )
        
        self.vector_memory = VectorStoreRetrieverMemory(
            retriever=self.vector_store.as_retriever(
                search_kwargs={"k": 5}
            )
        )
        
        # Entity extraction patterns
        self.entity_patterns = {
            "name": r"(?:my name is|i'm|i am|call me)\s+(\w+)",
            "email": r"[\w\.-]+@[\w\.-]+\.\w+",
            "phone": r"[\+]?[(]?[0-9]{1,3}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,4}[-\s\.]?[0-9]{1,9}",
            "order_id": r"(?:order|reference|ticket)\s*#?\s*([A-Z0-9]{6,})",
            "account_id": r"(?:account|customer)\s*#?\s*([0-9]{6,})"
        }
        
        # Context tracking
        self.active_sessions = {}
        self.user_profiles = {}
        
    def create_session(self, user_id: str = None, initial_context: Dict = None) -> str:
        """Create a new conversation session"""
        session_id = str(uuid.uuid4())
        user_id = user_id or f"user_{session_id[:8]}"
        
        session = ConversationSession(
            session_id=session_id,
            user_id=user_id,
            started_at=datetime.now().isoformat(),
            last_activity=datetime.now().isoformat(),
            turns=[],
            context=initial_context or {},
            entities={},
            workflow_state={}
        )
        
        # Store session
        self._store_session(session)
        self.active_sessions[session_id] = session
        
        # Load user profile if exists
        if user_id in self.user_profiles:
            session.context.update(self.user_profiles[user_id])
        
        logger.info(f"Created session {session_id} for user {user_id}")
        return session_id
    
    def add_turn(self, session_id: str, role: str, content: str, 
                 metadata: Dict = None, function_calls: List = None) -> None:
        """Add a conversation turn to session"""
        session = self._get_session(session_id)
        if not session:
            logger.error(f"Session {session_id} not found")
            return
        
        turn = ConversationTurn(
            timestamp=datetime.now().isoformat(),
            role=role,
            content=content,
            metadata=metadata or {},
            function_calls=function_calls
        )
        
        session.turns.append(turn)
        session.last_activity = datetime.now().isoformat()
        
        # Extract entities from user input
        if role == "user":
            self._extract_entities(session, content)
        
        # Update LangChain memory
        if role == "user":
            self.summary_memory.chat_memory.add_user_message(content)
        elif role == "assistant":
            self.summary_memory.chat_memory.add_ai_message(content)
        
        # Store in vector memory for long-term retrieval
        self.vector_memory.save_context(
            {"input": content if role == "user" else ""},
            {"output": content if role == "assistant" else ""}
        )
        
        # Update session
        self._store_session(session)
        
        # Summarize if conversation is getting long
        if len(session.turns) % 20 == 0:
            self._summarize_conversation(session)
    
    def get_context(self, session_id: str, include_summary: bool = True,
                   max_recent_turns: int = 10) -> Dict[str, Any]:
        """Get full context for a session"""
        session = self._get_session(session_id)
        if not session:
            return {}
        
        context = {
            "session_id": session_id,
            "user_id": session.user_id,
            "started_at": session.started_at,
            "turn_count": len(session.turns),
            "entities": session.entities,
            "workflow_state": session.workflow_state,
            "user_context": session.context
        }
        
        # Add recent conversation
        recent_turns = session.turns[-max_recent_turns:] if session.turns else []
        context["recent_conversation"] = [
            {
                "role": turn.role,
                "content": turn.content,
                "timestamp": turn.timestamp
            }
            for turn in recent_turns
        ]
        
        # Add summary if available
        if include_summary and session.summary:
            context["conversation_summary"] = session.summary
        
        # Get relevant long-term memories
        if session.turns:
            last_user_input = next(
                (turn.content for turn in reversed(session.turns) if turn.role == "user"),
                ""
            )
            if last_user_input:
                relevant_memories = self._retrieve_relevant_memories(last_user_input)
                context["relevant_memories"] = relevant_memories
        
        return context
    
    def search_memories(self, query: str, user_id: str = None, 
                       k: int = 5) -> List[Dict[str, Any]]:
        """Search through conversation memories"""
        # Search in vector store
        docs = self.vector_store.similarity_search(query, k=k)
        
        memories = []
        for doc in docs:
            memory = {
                "content": doc.page_content,
                "metadata": doc.metadata,
                "relevance_score": getattr(doc, 'score', None)
            }
            
            # Filter by user if specified
            if user_id and doc.metadata.get('user_id') != user_id:
                continue
                
            memories.append(memory)
        
        return memories
    
    def update_workflow_state(self, session_id: str, workflow_id: str, 
                            state: Dict[str, Any]) -> None:
        """Update workflow state in session"""
        session = self._get_session(session_id)
        if not session:
            return
        
        if not session.workflow_state:
            session.workflow_state = {}
        
        session.workflow_state[workflow_id] = {
            "state": state,
            "updated_at": datetime.now().isoformat()
        }
        
        self._store_session(session)
    
    def get_user_profile(self, user_id: str) -> Dict[str, Any]:
        """Get or create user profile with preferences and history"""
        if user_id not in self.user_profiles:
            self.user_profiles[user_id] = {
                "user_id": user_id,
                "created_at": datetime.now().isoformat(),
                "preferences": {},
                "interaction_count": 0,
                "last_interaction": None,
                "known_entities": {},
                "conversation_style": "friendly",
                "topics_discussed": [],
                "function_usage": {}
            }
        
        return self.user_profiles[user_id]
    
    def update_user_profile(self, user_id: str, updates: Dict[str, Any]) -> None:
        """Update user profile with new information"""
        profile = self.get_user_profile(user_id)
        
        # Update basic fields
        for key, value in updates.items():
            if key in profile:
                profile[key] = value
        
        profile["last_interaction"] = datetime.now().isoformat()
        profile["interaction_count"] += 1
        
        # Persist profile
        if self.redis_client:
            self.redis_client.set(
                f"user_profile:{user_id}",
                json.dumps(profile),
                ex=86400 * 30  # 30 days expiry
            )
    
    def get_conversation_insights(self, session_id: str) -> Dict[str, Any]:
        """Get insights about a conversation"""
        session = self._get_session(session_id)
        if not session:
            return {}
        
        # Calculate metrics
        total_turns = len(session.turns)
        user_turns = sum(1 for t in session.turns if t.role == "user")
        assistant_turns = sum(1 for t in session.turns if t.role == "assistant")
        function_calls = sum(len(t.function_calls or []) for t in session.turns)
        
        # Calculate average turn length
        avg_user_length = sum(len(t.content) for t in session.turns if t.role == "user") / max(user_turns, 1)
        avg_assistant_length = sum(len(t.content) for t in session.turns if t.role == "assistant") / max(assistant_turns, 1)
        
        # Identify topics (simplified - in production use NLP)
        topics = self._extract_topics(session)
        
        # Sentiment analysis (simplified - in production use proper sentiment analysis)
        sentiment = self._analyze_sentiment(session)
        
        return {
            "session_id": session_id,
            "duration": self._calculate_duration(session),
            "total_turns": total_turns,
            "user_turns": user_turns,
            "assistant_turns": assistant_turns,
            "function_calls": function_calls,
            "avg_user_message_length": avg_user_length,
            "avg_assistant_message_length": avg_assistant_length,
            "entities_extracted": list(session.entities.keys()),
            "topics": topics,
            "sentiment": sentiment,
            "workflow_states": list(session.workflow_state.keys()) if session.workflow_state else []
        }
    
    def cleanup_old_sessions(self, hours: int = 24) -> int:
        """Clean up sessions older than specified hours"""
        cutoff_time = datetime.now() - timedelta(hours=hours)
        cleaned = 0
        
        for session_id in list(self.active_sessions.keys()):
            session = self.active_sessions[session_id]
            last_activity = datetime.fromisoformat(session.last_activity)
            
            if last_activity < cutoff_time:
                # Summarize before cleanup
                self._summarize_conversation(session)
                
                # Store summary in long-term memory
                self._store_long_term_memory(session)
                
                # Remove from active sessions
                del self.active_sessions[session_id]
                cleaned += 1
        
        logger.info(f"Cleaned up {cleaned} old sessions")
        return cleaned
    
    # Private methods
    
    def _store_session(self, session: ConversationSession) -> None:
        """Store session in backend"""
        session_data = asdict(session)
        
        if self.redis_client:
            self.redis_client.set(
                f"session:{session.session_id}",
                json.dumps(session_data),
                ex=86400  # 24 hours expiry
            )
        else:
            self.memory_store[session.session_id] = session_data
    
    def _get_session(self, session_id: str) -> Optional[ConversationSession]:
        """Retrieve session from backend"""
        # Check active sessions first
        if session_id in self.active_sessions:
            return self.active_sessions[session_id]
        
        # Check storage
        session_data = None
        
        if self.redis_client:
            data = self.redis_client.get(f"session:{session_id}")
            if data:
                session_data = json.loads(data)
        elif session_id in self.memory_store:
            session_data = self.memory_store[session_id]
        
        if session_data:
            # Reconstruct session
            session = ConversationSession(
                session_id=session_data['session_id'],
                user_id=session_data['user_id'],
                started_at=session_data['started_at'],
                last_activity=session_data['last_activity'],
                turns=[ConversationTurn(**turn) for turn in session_data['turns']],
                context=session_data['context'],
                summary=session_data.get('summary', ''),
                entities=session_data.get('entities', {}),
                workflow_state=session_data.get('workflow_state', {})
            )
            
            self.active_sessions[session_id] = session
            return session
        
        return None
    
    def _extract_entities(self, session: ConversationSession, text: str) -> None:
        """Extract entities from text"""
        import re
        
        for entity_type, pattern in self.entity_patterns.items():
            matches = re.findall(pattern, text, re.IGNORECASE)
            if matches:
                if entity_type not in session.entities:
                    session.entities[entity_type] = []
                session.entities[entity_type].extend(matches)
                session.entities[entity_type] = list(set(session.entities[entity_type]))
    
    def _summarize_conversation(self, session: ConversationSession) -> None:
        """Generate summary of conversation"""
        # Get summary from LangChain memory
        messages = self.summary_memory.chat_memory.messages
        if messages:
            summary = self.summary_memory.predict_new_summary(
                messages,
                session.summary
            )
            session.summary = summary
            logger.info(f"Generated summary for session {session.session_id}")
    
    def _retrieve_relevant_memories(self, query: str, k: int = 3) -> List[str]:
        """Retrieve relevant memories for context"""
        docs = self.vector_store.similarity_search(query, k=k)
        return [doc.page_content for doc in docs]
    
    def _store_long_term_memory(self, session: ConversationSession) -> None:
        """Store session in long-term vector memory"""
        # Create document from session
        content = f"Session {session.session_id} for user {session.user_id}:\n"
        content += f"Summary: {session.summary}\n"
        content += f"Entities: {json.dumps(session.entities)}\n"
        
        metadata = {
            "session_id": session.session_id,
            "user_id": session.user_id,
            "timestamp": session.last_activity,
            "entities": session.entities,
            "turn_count": len(session.turns)
        }
        
        # Add to vector store
        self.vector_store.add_texts(
            texts=[content],
            metadatas=[metadata]
        )
        
        logger.info(f"Stored session {session.session_id} in long-term memory")
    
    def _calculate_duration(self, session: ConversationSession) -> float:
        """Calculate session duration in minutes"""
        start = datetime.fromisoformat(session.started_at)
        end = datetime.fromisoformat(session.last_activity)
        return (end - start).total_seconds() / 60
    
    def _extract_topics(self, session: ConversationSession) -> List[str]:
        """Extract main topics from conversation"""
        # Simplified topic extraction
        # In production, use proper NLP/topic modeling
        topics = []
        
        keywords = {
            "support": ["help", "support", "issue", "problem", "error"],
            "billing": ["payment", "bill", "charge", "invoice", "refund"],
            "account": ["account", "profile", "settings", "password", "login"],
            "order": ["order", "purchase", "delivery", "shipping", "product"],
            "technical": ["bug", "error", "crash", "slow", "broken"]
        }
        
        full_text = " ".join(t.content.lower() for t in session.turns)
        
        for topic, words in keywords.items():
            if any(word in full_text for word in words):
                topics.append(topic)
        
        return topics
    
    def _analyze_sentiment(self, session: ConversationSession) -> str:
        """Analyze overall sentiment of conversation"""
        # Simplified sentiment analysis
        # In production, use proper sentiment analysis model
        
        positive_words = ["thanks", "great", "good", "excellent", "happy", "perfect", "wonderful"]
        negative_words = ["bad", "terrible", "awful", "hate", "angry", "frustrated", "disappointed"]
        
        user_text = " ".join(t.content.lower() for t in session.turns if t.role == "user")
        
        positive_count = sum(word in user_text for word in positive_words)
        negative_count = sum(word in user_text for word in negative_words)
        
        if positive_count > negative_count * 2:
            return "positive"
        elif negative_count > positive_count * 2:
            return "negative"
        else:
            return "neutral"
    
    def export_session(self, session_id: str) -> Dict[str, Any]:
        """Export full session data for backup or analysis"""
        session = self._get_session(session_id)
        if not session:
            return {}
        
        return {
            "session": asdict(session),
            "insights": self.get_conversation_insights(session_id),
            "context": self.get_context(session_id)
        }
    
    def import_session(self, session_data: Dict[str, Any]) -> str:
        """Import session from exported data"""
        session_dict = session_data.get("session", {})
        
        session = ConversationSession(
            session_id=session_dict.get('session_id', str(uuid.uuid4())),
            user_id=session_dict['user_id'],
            started_at=session_dict['started_at'],
            last_activity=session_dict['last_activity'],
            turns=[ConversationTurn(**turn) for turn in session_dict['turns']],
            context=session_dict['context'],
            summary=session_dict.get('summary', ''),
            entities=session_dict.get('entities', {}),
            workflow_state=session_dict.get('workflow_state', {})
        )
        
        self._store_session(session)
        self.active_sessions[session.session_id] = session
        
        return session.session_id