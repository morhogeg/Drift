# Drift - Modern AI Chat with Side Threading

A beautiful, modern AI chat interface with innovative side-threading capabilities. Built with React, TypeScript, and Tailwind CSS.

![Drift Chat Interface](https://img.shields.io/badge/Status-In%20Development-yellow)
![React](https://img.shields.io/badge/React-18-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![Tailwind](https://img.shields.io/badge/Tailwind-3.4-06B6D4)

## ✨ Features

- 🌌 **Modern Dark Theme** - Elegant dark interface with pink/violet accents
- 💬 **Smart Chat Interface** - Beautiful message bubbles with animations
- 📚 **Chat History Sidebar** - Collapsible sidebar with search functionality
- 🎨 **Stunning UI/UX** - Gradients, shadows, and smooth transitions
- ⚡ **Fast & Responsive** - Built with Vite for optimal performance
- 🔀 **Side Threading** (Coming Soon) - Branch conversations from any message

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- OpenRouter API key (get one at [openrouter.ai/keys](https://openrouter.ai/keys))

### Installation

1. Clone the repository:
```bash
git clone https://github.com/morhogeg/Drift.git
cd Drift
```

2. Install dependencies:
```bash
npm install
```

3. Set up your API key:
   - Copy `.env.example` to `.env`
   - Add your OpenRouter API key:
```bash
cp .env.example .env
# Edit .env and add your key:
# VITE_OPENROUTER_API_KEY=your_api_key_here
```

4. Start the development server:
```bash
npm run dev
```

5. Open your browser to `http://localhost:5173`

### API Configuration

Drift uses OpenRouter to access the OpenAI OSS-20B model for free. To get started:

1. Sign up at [openrouter.ai](https://openrouter.ai)
2. Get your API key from [openrouter.ai/keys](https://openrouter.ai/keys)
3. Add the key to your `.env` file as shown above

The app also supports Ollama for local AI models. You can switch between OpenRouter and Ollama using the toggle button in the header.

## 🛠️ Tech Stack

- **React** - UI framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Framer Motion** - Animations
- **Vite** - Build tool
- **Lucide React** - Icons

## 🎨 Design Features

- Custom color palette with vibrant pink (#ff007a) and violet (#a855f7) accents
- Layered dark backgrounds for depth
- Smooth animations and transitions
- Responsive design that works on all devices
- Beautiful typography with Inter font

## 📝 Development

```bash
# Run development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## 🔜 Upcoming Features

- [ ] Full side-threading functionality
- [ ] Message highlighting and branching
- [ ] LLM integration (OpenAI/Ollama)
- [ ] Persistent chat storage
- [ ] Export conversations
- [ ] Multi-model support

## 📄 License

MIT

## 🤝 Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.

---

Built with ❤️ using modern web technologies