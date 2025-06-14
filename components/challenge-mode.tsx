"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useChallenge } from "@/context/challenge-context"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Send, Coins, ThumbsUp, ThumbsDown, Award, AlertTriangle } from "lucide-react"
import { Progress } from "@/components/ui/progress"

// Gemini API configuration
const GEMINI_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY
const MODEL_NAME = "gemini-1.5-flash"

export default function ChallengeMode() {
  const { balance, updateBalance } = useChallenge()
  const [question, setQuestion] = useState("")
  const [answer, setAnswer] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<null | { correct: boolean; explanation: string }>(null)
  const [streak, setStreak] = useState(0)
  const [progress, setProgress] = useState(0)
  const [showHint, setShowHint] = useState(false)
  const [history, setHistory] = useState<{ question: string; correct: boolean }[]>([])
  const [difficulty, setDifficulty] = useState("medium")

  // Progress bar animation
  useEffect(() => {
    if (isLoading) {
      const interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) {
            clearInterval(interval)
            return 100
          }
          return prev + 1
        })
      }, 30)

      return () => clearInterval(interval)
    } else {
      setProgress(0)
    }
  }, [isLoading])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!question.trim()) return

    setIsLoading(true)
    setResult(null)
    setShowHint(false)
    setProgress(0)

    try {
      // Use Gemini API directly
      const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${GEMINI_API_KEY}`

      const systemInstruction = `You are an AI assistant participating in a challenge game where users try to trick you into giving wrong answers.
        Answer the user's question. Don't mention that this is a challenge or game.
        Occasionally (about 30% of the time), deliberately give a slightly incorrect answer that sounds plausible but contains a subtle error.
        This makes the game fun for users who are trying to catch you making mistakes.`

      const requestBody = {
        contents: [
          {
            role: "user",
            parts: [{ text: question }],
          },
        ],
        systemInstruction: {
          parts: [{ text: systemInstruction }],
        },
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
        const aiResponse = data.candidates[0].content.parts[0].text
        setAnswer(aiResponse)
      }
    } catch (error) {
      console.error("Error in challenge mode:", error)
      setAnswer("Sorry, there was an error processing your challenge.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleJudgment = (isCorrect: boolean) => {
    // Update streak
    if (isCorrect) {
      setStreak(0)
      updateBalance(-1)
    } else {
      setStreak((prev) => prev + 1)
      updateBalance(1)

      // Trigger confetti for correct judgments
      if (typeof window !== "undefined" && window.confetti) {
        window.confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
        })
      }
    }

    // Add to history
    setHistory((prev) => [{ question, correct: !isCorrect }, ...prev.slice(0, 9)])

    // Set result
    setResult({
      correct: isCorrect,
      explanation: isCorrect
        ? "The AI's answer was correct! You lose ₹1."
        : "You caught the AI making a mistake! You win ₹1.",
    })

    // Reset for next question
    setQuestion("")
  }

  const getHint = () => {
    return "Look for subtle errors in facts, dates, or mathematical calculations. AI sometimes makes mistakes in these areas."
  }

  return (
    <div className="space-y-4">
      <Card className="border-amber-200 dark:border-amber-700/30 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center gap-2">
              <Coins className="h-5 w-5 text-amber-500" />
              Challenge Mode
            </CardTitle>
            <Badge
              variant="outline"
              className="text-xl py-2 px-4 border-amber-300 dark:border-amber-500/50 bg-amber-100/50 dark:bg-amber-900/20"
            >
              Your Balance: ₹{balance}
            </Badge>
          </div>
          <CardDescription className="text-gray-600 dark:text-gray-400">
            Try to trick the AI with a question it might get wrong. If the AI answers incorrectly, you win ₹1. If it
            answers correctly, you lose ₹1.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card className="bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-700/30">
              <CardContent className="p-4 flex flex-col items-center">
                <Award className="h-8 w-8 text-amber-500 mb-2" />
                <div className="text-2xl font-bold">{streak}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">Current Streak</div>
              </CardContent>
            </Card>

            <Card className="bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-700/30">
              <CardContent className="p-4 flex flex-col items-center">
                <ThumbsUp className="h-8 w-8 text-green-500 mb-2" />
                <div className="text-2xl font-bold">{history.filter((h) => h.correct).length}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">Caught Mistakes</div>
              </CardContent>
            </Card>

            <Card className="bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-700/30">
              <CardContent className="p-4 flex flex-col items-center">
                <ThumbsDown className="h-8 w-8 text-red-500 mb-2" />
                <div className="text-2xl font-bold">{history.filter((h) => !h.correct).length}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">Failed Attempts</div>
              </CardContent>
            </Card>
          </div>

          <div className="mb-4">
            <div className="flex justify-between mb-2">
              <span className="text-gray-700 dark:text-gray-300">Difficulty</span>
              <span className="capitalize text-amber-600 dark:text-amber-400">{difficulty}</span>
            </div>
            <div className="flex gap-2">
              {["easy", "medium", "hard"].map((level) => (
                <Button
                  key={level}
                  variant={difficulty === level ? "default" : "outline"}
                  size="sm"
                  onClick={() => setDifficulty(level)}
                  className={difficulty === level ? "bg-amber-600 hover:bg-amber-700" : ""}
                >
                  {level.charAt(0).toUpperCase() + level.slice(1)}
                </Button>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask a tricky question that might confuse the AI..."
                className="min-h-[100px] resize-none bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 focus:border-amber-500"
                disabled={isLoading}
              />
              <div className="flex justify-between mt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowHint(!showHint)}
                  className="text-amber-600 dark:text-amber-400"
                >
                  <AlertTriangle className="h-4 w-4 mr-1" />
                  {showHint ? "Hide Hint" : "Show Hint"}
                </Button>

                <span className="text-xs text-gray-500 dark:text-gray-400">{question.length} characters</span>
              </div>

              {showHint && (
                <div className="mt-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/30 rounded-md text-sm text-gray-700 dark:text-gray-300">
                  {getHint()}
                </div>
              )}
            </div>

            <Button
              type="submit"
              disabled={isLoading || !question.trim()}
              className="w-full bg-amber-600 hover:bg-amber-700"
            >
              <Send className="h-4 w-4 mr-2" />
              Submit Challenge
            </Button>
          </form>

          {isLoading && (
            <div className="mt-4">
              <div className="flex justify-between text-xs mb-1 text-gray-600 dark:text-gray-400">
                <span>AI is thinking...</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          {answer && (
            <Card className="mt-6 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
                  AI's Answer
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="prose dark:prose-invert max-w-none">
                  <p className="whitespace-pre-wrap">{answer}</p>
                </div>
              </CardContent>

              {!result ? (
                <CardFooter className="flex justify-center gap-4 border-t border-gray-200 dark:border-gray-700 pt-4">
                  <Button
                    onClick={() => handleJudgment(true)}
                    variant="outline"
                    className="border-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"
                  >
                    <ThumbsUp className="h-4 w-4 mr-2 text-green-500" />
                    Correct Answer
                  </Button>
                  <Button
                    onClick={() => handleJudgment(false)}
                    variant="outline"
                    className="border-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    <ThumbsDown className="h-4 w-4 mr-2 text-red-500" />
                    Wrong Answer
                  </Button>
                </CardFooter>
              ) : (
                <CardFooter
                  className={`border-t ${
                    result.correct
                      ? "border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20"
                      : "border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20"
                  }`}
                >
                  <p
                    className={`font-medium ${
                      result.correct ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
                    }`}
                  >
                    {result.explanation}
                  </p>
                </CardFooter>
              )}
            </Card>
          )}

          {history.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-medium mb-3 text-gray-800 dark:text-gray-200">Recent Challenges</h3>
              <div className="space-y-2">
                {history.map((item, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-2 bg-white dark:bg-gray-800/50 rounded-md border border-gray-200 dark:border-gray-700"
                  >
                    <p className="text-sm truncate max-w-[70%] text-gray-700 dark:text-gray-300">{item.question}</p>
                    <Badge variant={item.correct ? "success" : "destructive"}>
                      {item.correct ? "Caught" : "Missed"}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
