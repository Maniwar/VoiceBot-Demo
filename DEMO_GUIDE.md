# VoiceBot Demo Guide - Workflows & Orchestration

## 🎯 Quick Demo Steps

### 1. Start the Server
```bash
source venv/bin/activate
python src/server.py
```

### 2. Open Two Browser Tabs
- **Main Interface**: http://localhost:3000
- **Admin Panel**: http://localhost:3000/admin.html

## 🎭 Demo Scenarios

### Demo 1: Voice Commands with Presets
**In Main Interface (http://localhost:3000):**

1. **Dad Jokes** 🎤
   - Click the red microphone button (or hold spacebar)
   - Say: "Tell me a joke"
   - The system will fetch and speak a dad joke

2. **Weather Information** 🌤️
   - Say: "What's the weather in Paris?"
   - The system will provide weather information

3. **Inspiration** ✨
   - Say: "Inspire me"
   - Get a motivational quote

### Demo 2: RAG Document Search
**In Main Interface:**

1. **Upload Documents**
   - Drag and drop PDF/TXT files into the upload area
   - Watch the chunk count increase

2. **Query Documents**
   - Say or type: "What information is in the documents?"
   - Say: "Search for [specific topic]"
   - The AI will search and provide answers from uploaded docs

### Demo 3: Workflow Orchestration
**In Admin Panel (http://localhost:3000/admin.html):**

1. **View Preset Workflows**
   - Go to "Workflow Builder" tab
   - Click "Load Template" dropdown
   - Select from:
     - Customer Onboarding
     - Support Ticket
     - Data Analysis

2. **Build Custom Workflow**
   - Drag functions from left panel to canvas:
     - 🔌 API Call
     - 🗄️ Database Query
     - 📧 Send Notification
     - 🔀 Condition Check
     - 🤖 LLM Process
   - Configure each step
   - Click "Save Workflow"

3. **Test Workflows**
   - Click "Test Workflow" button
   - View execution steps in real-time

### Demo 4: API Orchestration
**In Admin Panel:**

1. **API Configuration Tab**
   - View registered endpoints
   - Add custom API endpoints
   - Test API calls

2. **Function Library**
   - See available functions
   - Click "Add Custom Function"
   - Write custom JavaScript functions

### Demo 5: Live Testing
**In Admin Panel:**

1. **Go to Testing Tab**
   - Click test buttons:
     - 🎤 Voice Test
     - 😂 Dad Joke Test
     - 🌤️ Weather Test
     - 📚 RAG Test
     - 🔄 Workflow Test

2. **View Results**
   - See response times
   - Check success/failure status
   - View detailed logs

## 🎮 Interactive Features to Show

### Voice Features
- **Real-time transcription**: Shows what you're saying
- **Audio visualization**: Animated bars during recording
- **Interrupt handling**: Can interrupt AI while speaking
- **Multiple voices**: Change voice in admin panel

### Workflow Builder
- **Drag & Drop**: Visual workflow creation
- **Step Configuration**: Click gear icon on each step
- **Conditional Logic**: Add branching paths
- **Live Preview**: See workflow structure update

### Admin Analytics
- **Session count**: Track active sessions
- **API calls**: Monitor usage
- **Success rate**: View reliability metrics
- **Response times**: Performance tracking

## 📝 Sample Voice Commands

```
"Tell me a joke"
"What's the weather in New York?"
"Inspire me with a quote"
"Search for information about [topic]"
"What documents have I uploaded?"
"Summarize the uploaded files"
"Execute customer onboarding workflow"
```

## 🚀 Advanced Demos

### Multi-Step Workflow
1. Upload a customer data file
2. Say: "Process the customer data"
3. Watch the workflow:
   - Validate data
   - Store in database
   - Send notifications
   - Generate report

### API Chain Demo
1. Say: "Get weather and suggest activities"
2. System will:
   - Call weather API
   - Process with LLM
   - Suggest weather-appropriate activities

## 💡 Tips for Impressive Demos

1. **Start Simple**: Begin with dad jokes to show it works
2. **Build Complexity**: Move to RAG, then workflows
3. **Show Visual Feedback**: Point out animations and status updates
4. **Explain Architecture**: Use admin panel to show behind-the-scenes
5. **Handle Errors Gracefully**: Show how system recovers

## 🎬 Demo Script

"Let me show you our advanced voice bot with workflow orchestration:

1. **Basic Voice AI** - 'Tell me a joke' [Shows immediate response]

2. **Knowledge Base** - [Upload document] 'What's in this document?' [Shows RAG search]

3. **Workflow Builder** - [Open admin] Here we can visually create complex workflows by dragging and dropping actions

4. **Live Orchestration** - [Load customer onboarding] This workflow automatically handles multiple steps: database checks, emails, API calls, all triggered by voice

5. **Real-time Execution** - [Test workflow] Watch as each step executes in sequence, with full visibility into the process"

## 🔧 Troubleshooting

- **No voice response**: Check microphone permissions
- **Upload fails**: Ensure file is PDF/TXT/JSON
- **Workflow won't save**: Add workflow name and at least one step
- **Admin panel errors**: Refresh page to reload functions

## 🌟 Key Selling Points

1. **No-code workflow builder**
2. **Real-time voice processing**
3. **Document understanding (RAG)**
4. **Visual orchestration**
5. **Extensible with custom functions**
6. **Production-ready architecture**