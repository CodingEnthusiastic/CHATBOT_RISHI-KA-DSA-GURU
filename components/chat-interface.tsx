"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { useMode } from "@/context/mode-context"
import { useChallenge } from "@/context/challenge-context"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Mic, MicOff, Send, Volume2, VolumeX, Globe } from "lucide-react"
import ChatMessage from "@/components/chat-message"
import ModeHeader from "@/components/mode-header"
import ChallengeMode from "@/components/challenge-mode"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

// Declare global interfaces for TypeScript
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onaudioend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onaudiostart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => any) | null;
  onnomatch: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
  onstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

// Define the Message type
interface Message {
  role: string
  content: string
  id: string
  fromVoice?: boolean
  englishContent?: string // For storing English translations
}

// Gemini API configuration

const GEMINI_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_GENERATIVE_AI_API_KEY
const MODEL_NAME = "gemini-1.5-flash"

export default function ChatInterface() {
  const { mode } = useMode()
  const { isChallengeModeActive } = useChallenge()
  const [isVoiceInput, setIsVoiceInput] = useState(false)
  const [isVoiceOutput, setIsVoiceOutput] = useState(true)
  const [isRecording, setIsRecording] = useState(false)
  const [transcript, setTranscript] = useState("")
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [isVoiceSubmission, setIsVoiceSubmission] = useState(false)
  const [voiceLanguage, setVoiceLanguage] = useState("en-US")
  const [speechLanguage, setSpeechLanguage] = useState("en-US")
  const [recognitionInstance, setRecognitionInstance] = useState<any>(null)
  const [recognitionError, setRecognitionError] = useState<string | null>(null)
  const [isListening, setIsListening] = useState(false)
  const [interimTranscript, setInterimTranscript] = useState("")

  // Independent chat state for each mode
  const [modeMessages, setModeMessages] = useState<{
    [key: string]: Message[]
  }>({
    default: [],
    dsa: [],
    upsc: [],
    love: [],
    gym: [],
  })
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  // Get current mode's messages
  const messages = modeMessages[mode] || []

  // Extract Hindi phrases for English TTS
  const extractEnglishForSpeech = (text: string) => {
    // Simple regex to identify Hindi phrases (often in quotes or parentheses)
    const hindiPhraseRegex = /"([^"]*)"|$$([^)]*)$$|'([^']*)'|「([^」]*)」/g

    // Replace Hindi phrases with placeholder or simple English equivalent
    const englishText = text.replace(hindiPhraseRegex, (match) => {
      // You could add specific translations here for common phrases
      return "[Hindi phrase]"
    })

    return englishText
  }

  // Text-to-speech function
  const speakText = (text: string, englishContent?: string) => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel() // Cancel any ongoing speech

      // Use English content if available, otherwise extract English parts
      const speechText = englishContent || extractEnglishForSpeech(text)

      const utterance = new SpeechSynthesisUtterance(speechText)
      utterance.lang = speechLanguage

      // Adjust rate and pitch for better clarity
      utterance.rate = 0.9
      utterance.pitch = 1.0

      window.speechSynthesis.speak(utterance)
    }
  }

  const toggleVoiceInput = () => {
    setIsVoiceInput(!isVoiceInput)
    if (isRecording) {
      setIsRecording(false)
    }
  }

  const toggleVoiceOutput = () => {
    setIsVoiceOutput(!isVoiceOutput)
    if (isVoiceOutput) {
      window.speechSynthesis?.cancel()
    }
  }

  // Replace the toggleRecording function with this simpler version
  const toggleRecording = () => {
    if (!isVoiceInput) return;
    
    console.log("Toggle recording:", !isRecording);
    
    if (!isRecording) {
      // Starting recording
      setTranscript("");
      setInput("");
      setInterimTranscript("");
      setRecognitionError(null);
      
      try {
        // Create a new instance each time to ensure fresh permission request
        const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
        
        if (!SpeechRecognitionAPI) {
          setRecognitionError("Speech recognition not supported in this browser");
          return;
        }
        
        const recognition = new SpeechRecognitionAPI();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = voiceLanguage;
        
        recognition.onresult = (event) => {
          let finalTranscript = '';
          let interimResult = '';
          
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript;
            } else {
              interimResult += event.results[i][0].transcript;
            }
          }
          
          if (finalTranscript) {
            setTranscript(prev => prev + ' ' + finalTranscript);
            setInput(prev => prev + ' ' + finalTranscript);
          }
          
          setInterimTranscript(interimResult);
        };
        
        recognition.onerror = (event) => {
          console.error("Speech recognition error:", event.error);
          setRecognitionError(`Error: ${event.error}`);
          setIsRecording(false);
          setIsListening(false);
        };
        
        recognition.onend = () => {
          console.log("Recognition ended");
          setIsListening(false);
          
          if (isRecording) {
            try {
              recognition.start();
              setIsListening(true);
            } catch (err) {
              console.error("Failed to restart recognition:", err);
              setIsRecording(false);
            }
          }
        };
        
        // Start recognition immediately
        recognition.start();
        setIsListening(true);
        setRecognitionInstance(recognition);
        
      } catch (error) {
        console.error("Error starting speech recognition:", error);
        setRecognitionError("Failed to start speech recognition");
        setIsRecording(false);
        return;
      }
    } else {
      // Stopping recording
      try {
        if (recognitionInstance) {
          recognitionInstance.stop();
          setIsListening(false);
          
          // If we have transcript, automatically submit
          if (transcript.trim()) {
            setTimeout(() => handleSubmit(new Event("submit") as any), 300);
          }
        }
      } catch (err) {
        console.error("Error stopping recognition:", err);
      }
    }
    
    setIsRecording(!isRecording);
    setIsVoiceSubmission(true);
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isRecording) {
      setIsRecording(false)
    }

    const userInput = input.trim()
    if (!userInput) return

    // Add user message
    const userMessage = {
      role: "user",
      content: userInput,
      id: Date.now().toString(),
      fromVoice: isVoiceSubmission,
    }

    setModeMessages((prev) => ({
      ...prev,
      [mode]: [...(prev[mode] || []), userMessage],
    }))

    setInput("")
    setIsLoading(true)
    setIsVoiceSubmission(false)

    // Get system instruction based on mode
    const systemInstruction = getSystemInstruction(mode)

    try {
      // Use Gemini API directly
      const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${GEMINI_API_KEY}`
      console.log(API_URL);
      console.log(process.env);
      let check=true;
      console.log(check);
      const requestBody = {
        contents: [
          ...messages.map((msg) => ({
            role: msg.role === "user" ? "user" : "model",
            parts: [{ text: msg.content }],
          })),
          {
            role: "user",
            parts: [{ text: userInput }],
          },
        ],
        systemInstruction: {
          parts: [{ text: systemInstruction }],
        },
      }
      console.log(check);
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      })
      console.log(check);
      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`)
      }
      console.log(check);
      const data = await response.json()

      if (
        data.candidates &&
        data.candidates.length > 0 &&
        data.candidates[0].content &&
        data.candidates[0].content.parts &&
        data.candidates[0].content.parts.length > 0
      ) {
        const aiResponse = data.candidates[0].content.parts[0].text

        // If response contains Hindi, get English version for speech
        let englishContent = null
        if (mode === "default" && containsHindi(aiResponse)) {
          englishContent = await getEnglishVersion(aiResponse)
        }
        console.log(check);
        // Add AI response
        const aiMessage = {
          role: "assistant",
          content: aiResponse,
          id: Date.now().toString(),
          englishContent: englishContent,
        }
        console.log(check);
        setModeMessages((prev) => ({
          ...prev,
          [mode]: [...(prev[mode] || []), aiMessage],
        }))
        console.log(check);
        if (isVoiceOutput) {
          speakText(aiResponse, englishContent)
        }
      }
    } catch (error) {
      console.error("Error fetching response:", error)
     // console.log(check);
      // Add error message
      const errorMessage = {
        role: "assistant",
        content: "Sorry, I encountered an error while processing your request. Please try again.",
        id: Date.now().toString(),
      }

      setModeMessages((prev) => ({
        ...prev,
        [mode]: [...(prev[mode] || []), errorMessage],
      }))

      if (isVoiceOutput) {
        speakText("Sorry, I encountered an error while processing your request. Please try again.")
      }
    } finally {
      setIsLoading(false)
    }
  }

  // Check if text contains Hindi
  const containsHindi = (text: string) => {
    // Simple check for Devanagari Unicode range
    const hindiRegex = /[\u0900-\u097F]/
    return (
      hindiRegex.test(text) ||
      text.includes("chamak raha hai") ||
      text.includes("haanji") ||
      text.includes("swaad") ||
      text.includes("baap concept")
    )
  }

  // Get English version of text with Hindi
  const getEnglishVersion = async (text: string) => {
    try {
      // Use Gemini API to translate Hindi phrases to English
      const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${GEMINI_API_KEY}`

      const requestBody = {
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Convert the following text to proper English for text-to-speech, keeping the technical content intact but replacing Hindi phrases with English equivalents: "${text}"`,
              },
            ],
          },
        ],
      }

      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`)
      }

      const data = await response.json()

      if (
        data.candidates &&
        data.candidates.length > 0 &&
        data.candidates[0].content &&
        data.candidates[0].content.parts &&
        data.candidates[0].content.parts.length > 0
      ) {
        return data.candidates[0].content.parts[0].text
      }

      return null
    } catch (error) {
      console.error("Error getting English version:", error)
      return null
    }
  }

  // Get system instruction based on mode
  const getSystemInstruction = (mode: string) => {
    switch (mode) {
      case "dsa":
        return `You are Rohit Negi's AI assistant specializing in Data Structures and Algorithms.
          Respond in a teaching style similar to Rohit Negi - clear, concise, and with practical examples.
          Focus on DSA concepts, coding problems, time complexity, and optimization techniques.
          If asked about non-DSA topics, politely redirect to DSA or answer briefly. Stop saying hindi phrasec at the end `
      case "upsc":
        return `You are an AI assistant specializing in UPSC exam preparation.
          Provide detailed, accurate information about Indian history, polity, geography, economics, and current affairs.
          Use structured responses with bullet points for complex topics.
          If asked about non-UPSC topics, politely redirect to UPSC or answer briefly.Stop saying hindi phrasec at the end`
      case "love":
        return `You are a humorous love and relationship advisor AI.
          Provide relationship advice with a light-hearted, slightly sarcastic tone.
          Be funny but also genuinely helpful with relationship questions.
          If asked about non-relationship topics, roast the user in a funny way and redirect to relationship advice.Stop saying hindi phrasec at the end`
      case "gym":
        return `You are a motivational gym trainer and fitness advisor AI.
          Provide workout tips, nutrition advice, and fitness motivation in an energetic, encouraging style.
          Use gym slang and motivational phrases occasionally.
          If asked about non-fitness topics, respond with a gym-related joke and redirect to fitness advice.Stop saying hindi phrasec at the end`
      default:
        return `You are a helpful AI assistant created by Rohit Negi, a famous DSA instructor on YouTube.
          You can answer questions on various topics but specialize in programming and computer science.
          If users ask questions completely unrelated to education or knowledge, respond with a humorous quip.
          You would answer in some Hindi accent like "chamak raha hai concept" (the concept is shining), "haanji" (yes), "aa gya swaad" (that's delicious/enjoyable), "baap concept coder army ke alawa aur kahi nahi milega" (you won't find such great concepts anywhere except Coder Army), "macbook chahiye, ye lo book" (you want a MacBook? Here's a book), etc.
          `
    }
  }

  // Start/stop recognition based on isRecording state
  useEffect(() => {
    if (!recognitionInstance) return;
    
    if (isRecording) {
      setRecognitionError(null);
      setTranscript("");
      setInput("");
      setInterimTranscript("");
      try {
        recognitionInstance.stop();
        setTimeout(() => {
          try {
            recognitionInstance.start();
            setIsListening(true);
          } catch (err) {
            console.error("Failed to start recognition:", err);
            setRecognitionError("Failed to start speech recognition");
          }
        }, 100);
      } catch (err) {
        console.error("Recognition error:", err);
        try {
          recognitionInstance.start();
          setIsListening(true);
        } catch (innerErr) {
          console.error("Failed to recover:", innerErr);
          setRecognitionError("Speech recognition failed to start");
        }
      }
    } else if (isListening) {
      recognitionInstance.stop();
      setIsListening(false);
    }
  }, [isRecording, recognitionInstance]);

  // Language change handler
  const handleLanguageChange = (languageCode: string) => {
    setVoiceLanguage(languageCode);
    // For most languages, use the same language for speech output
    // For special cases like Hindi, maintain English speech output
    if (!languageCode.startsWith('hi')) {
      setSpeechLanguage(languageCode);
    }
    
    // Update recognition language if instance exists
    if (recognitionInstance) {
      recognitionInstance.lang = languageCode;
    }
  }

  // Welcome message when entering a mode
  useEffect(() => {
    if (messages.length === 0) {
      const welcomeMessage = `Welcome to ${mode === "default" ? "DSA Guru AI" : `${mode.toUpperCase()} Mode`}! How can I help you today?`

      const welcomeAiMessage = {
        role: "assistant",
        content: welcomeMessage,
        id: Date.now().toString(),
      }

      setModeMessages((prev) => ({
        ...prev,
        [mode]: [welcomeAiMessage],
      }))

      if (isVoiceOutput) {
        setTimeout(() => {
          speakText(welcomeMessage)
        }, 500)
      }
    }
  }, [mode])

  return (
    <div className="flex flex-col h-full space-y-4">
      <Tabs defaultValue="chat" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="chat">Chat</TabsTrigger>
          <TabsTrigger value="challenge">Challenge Mode</TabsTrigger>
        </TabsList>

        <TabsContent value="chat" className="space-y-4">
          <ModeHeader />

          <Card className="border-gray-200 dark:border-gray-800 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm">
            <CardContent className="p-4 h-[60vh] overflow-y-auto flex flex-col space-y-4">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center text-gray-500 dark:text-gray-400">
                  <h3 className="text-xl font-bold mb-2">
                    Welcome to {mode === "default" ? "DSA Guru AI" : `${mode.toUpperCase()} Mode`}!
                  </h3>
                  <p>Ask me anything about {mode === "default" ? "Data Structures & Algorithms" : mode}.</p>
                </div>
              ) : (
                messages.map((message) => (
                  <ChatMessage
                    key={message.id}
                    message={message}
                    fromVoice={message.fromVoice}
                    onSpeak={() =>
                      message.englishContent
                        ? speakText(message.content, message.englishContent)
                        : speakText(message.content)
                    }
                  />
                ))
              )}
              {isLoading && (
                <div className="flex items-center justify-center p-4">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
                  <span className="ml-3 text-gray-500 dark:text-gray-400">Thinking...</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </CardContent>
          </Card>

          <form onSubmit={handleSubmit} className="flex items-end space-x-2">
            {isRecording && (
              <div className="absolute top-0 left-0 right-0 z-10 bg-red-500/10 border border-red-500/30 rounded-md p-2 flex flex-col">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <span className="h-3 w-3 rounded-full bg-red-500 animate-pulse mr-2"></span>
                    <span className="text-sm font-medium text-red-400">Recording... ({voiceLanguage.split('-')[0]})</span>
                  </div>
                  {recognitionError && (
                    <span className="text-xs text-red-500">{recognitionError}</span>
                  )}
                </div>
                {interimTranscript && (
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 italic">
                    {interimTranscript}
                  </div>
                )}
              </div>
            )}
            <div className="relative flex-grow">
              {isVoiceInput && (
                <div className="absolute top-0 left-0 right-0 bg-gray-100 dark:bg-gray-800 p-2 rounded-t-md border-b border-gray-200 dark:border-gray-700">
                  <p className="text-sm text-gray-700 dark:text-gray-300 truncate">{transcript || "Speak now..."}</p>
                </div>
              )}
              <Textarea
                value={isVoiceInput && isRecording ? transcript : input}
                onChange={handleInputChange}
                placeholder={`Ask ${mode === "default" ? "anything" : mode + " related questions"}...`}
                className={`min-h-[80px] resize-none bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 focus:border-purple-500 ${isVoiceInput ? "pt-12" : ""}`}
                disabled={isLoading || (isVoiceInput && isRecording)}
              />
              <div className="absolute bottom-2 right-2 flex space-x-1">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" size="icon" variant="ghost" className="text-gray-500 dark:text-gray-400">
                      <Globe className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleLanguageChange("en-US")}>
                      English (US)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleLanguageChange("en-IN")}>
                      English (Indian)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleLanguageChange("hi-IN")}>
                      Hindi
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleLanguageChange("es-ES")}>
                      Spanish
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleLanguageChange("fr-FR")}>
                      French
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleLanguageChange("de-DE")}>
                      German
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleLanguageChange("ja-JP")}>
                      Japanese
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleLanguageChange("zh-CN")}>
                      Chinese (Simplified)
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={toggleVoiceInput}
                  className={isVoiceInput ? "text-purple-500" : "text-gray-500 dark:text-gray-400"}
                >
                  {isVoiceInput ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={toggleVoiceOutput}
                  className={isVoiceOutput ? "text-purple-500" : "text-gray-500 dark:text-gray-400"}
                >
                  {isVoiceOutput ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {isVoiceInput ? (
              <Button
                type="button"
                onClick={toggleRecording}
                disabled={isLoading}
                className={`${isRecording ? "bg-red-500 hover:bg-red-600" : "bg-purple-600 hover:bg-purple-700"}`}
              >
                {isRecording ? "Stop" : "Record"}
              </Button>
            ) : (
              <Button type="submit" disabled={isLoading || !input.trim()}>
                <Send className="h-4 w-4 mr-2" />
                Send
              </Button>
            )}
          </form>
        </TabsContent>

        <TabsContent value="challenge">
          <ChallengeMode />
        </TabsContent>
      </Tabs>
    </div>
  )
}
