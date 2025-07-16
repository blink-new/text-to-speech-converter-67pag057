import { useState, useRef, useEffect } from 'react'
import { Button } from './components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card'
import { Textarea } from './components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select'
import { Slider } from './components/ui/slider'
import { Label } from './components/ui/label'
import { Progress } from './components/ui/progress'
import { Separator } from './components/ui/separator'
import { Badge } from './components/ui/badge'
import { Play, Pause, Square, Download, Trash2, Volume2, Settings } from 'lucide-react'
import { blink } from './blink/client'
import { toast } from 'react-hot-toast'

interface ConversionHistory {
  id: string
  text: string
  voice: string
  speed: number
  pitch: number
  audioUrl: string
  createdAt: Date
}

function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [voice, setVoice] = useState('nova')
  const [speed, setSpeed] = useState([1.0])
  const [isGenerating, setIsGenerating] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentAudio, setCurrentAudio] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [history, setHistory] = useState<ConversionHistory[]>([])
  
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const progressInterval = useRef<NodeJS.Timeout | null>(null)

  // Auth state management
  useEffect(() => {
    const unsubscribe = blink.auth.onAuthStateChanged((state) => {
      setUser(state.user)
      setLoading(state.isLoading)
    })
    return unsubscribe
  }, [])

  // Load history when user is authenticated
  useEffect(() => {
    if (user) {
      loadHistory()
    }
  }, [user])

  const loadHistory = () => {
    try {
      const stored = localStorage.getItem(`tts-history-${user.id}`)
      if (stored) {
        const parsed = JSON.parse(stored)
        setHistory(parsed.map((item: any) => ({
          ...item,
          createdAt: new Date(item.createdAt)
        })))
      }
    } catch (error) {
      console.error('Failed to load history:', error)
    }
  }

  const saveHistory = (newHistory: ConversionHistory[]) => {
    try {
      localStorage.setItem(`tts-history-${user.id}`, JSON.stringify(newHistory))
    } catch (error) {
      console.error('Failed to save history:', error)
    }
  }

  const handleGenerate = async () => {
    if (!text.trim()) {
      toast.error('Please enter some text to convert')
      return
    }

    if (text.length > 4000) {
      toast.error('Text is too long. Please keep it under 4000 characters.')
      return
    }

    setIsGenerating(true)
    try {
      const { url } = await blink.ai.generateSpeech({
        text: text.trim(),
        voice: voice as any,
        speed: speed[0]
      })

      setCurrentAudio(url)
      
      // Save to history
      const conversion: ConversionHistory = {
        id: Date.now().toString(),
        text: text.trim(),
        voice,
        speed: speed[0],
        pitch: 1.0, // Default pitch for now
        audioUrl: url,
        createdAt: new Date()
      }

      const newHistory = [conversion, ...history.slice(0, 9)]
      setHistory(newHistory)
      saveHistory(newHistory)
      toast.success('Speech generated successfully!')
    } catch (error) {
      console.error('Failed to generate speech:', error)
      toast.error('Failed to generate speech. Please try again.')
    } finally {
      setIsGenerating(false)
    }
  }

  const handlePlay = () => {
    if (!currentAudio) return

    if (audioRef.current) {
      audioRef.current.pause()
    }

    audioRef.current = new Audio(currentAudio)
    audioRef.current.playbackRate = speed[0]
    
    audioRef.current.addEventListener('loadedmetadata', () => {
      setProgress(0)
      startProgressTracking()
    })

    audioRef.current.addEventListener('ended', () => {
      setIsPlaying(false)
      setProgress(0)
      stopProgressTracking()
    })

    audioRef.current.play()
    setIsPlaying(true)
  }

  const handlePause = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      setIsPlaying(false)
      stopProgressTracking()
    }
  }

  const handleStop = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      setIsPlaying(false)
      setProgress(0)
      stopProgressTracking()
    }
  }

  const startProgressTracking = () => {
    progressInterval.current = setInterval(() => {
      if (audioRef.current) {
        const progress = (audioRef.current.currentTime / audioRef.current.duration) * 100
        setProgress(progress)
      }
    }, 100)
  }

  const stopProgressTracking = () => {
    if (progressInterval.current) {
      clearInterval(progressInterval.current)
      progressInterval.current = null
    }
  }

  const handleDownload = () => {
    if (!currentAudio) return
    
    const link = document.createElement('a')
    link.href = currentAudio
    link.download = `speech-${Date.now()}.mp3`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleClear = () => {
    setText('')
    setCurrentAudio(null)
    setProgress(0)
    handleStop()
  }

  const playFromHistory = (item: ConversionHistory) => {
    setText(item.text)
    setVoice(item.voice)
    setSpeed([item.speed])
    setCurrentAudio(item.audioUrl)
  }

  const deleteFromHistory = (id: string) => {
    try {
      const newHistory = history.filter(item => item.id !== id)
      setHistory(newHistory)
      saveHistory(newHistory)
      toast.success('Removed from history')
    } catch (error) {
      console.error('Failed to delete from history:', error)
      toast.error('Failed to remove from history')
    }
  }

  if (loading) {
    return (
      <div className=\"min-h-screen bg-background flex items-center justify-center\">
        <div className=\"text-center\">
          <div className=\"animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4\"></div>
          <p className=\"text-muted-foreground\">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className=\"min-h-screen bg-background flex items-center justify-center\">
        <Card className=\"w-full max-w-md\">
          <CardHeader className=\"text-center\">
            <CardTitle className=\"flex items-center justify-center gap-2\">
              <Volume2 className=\"h-6 w-6 text-primary\" />
              Text-to-Speech Converter
            </CardTitle>
          </CardHeader>
          <CardContent className=\"text-center\">
            <p className=\"text-muted-foreground mb-4\">Please sign in to use the text-to-speech converter</p>
            <Button onClick={() => blink.auth.login()}>
              Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const characterCount = text.length
  const characterLimit = 4000

  return (
    <div className=\"min-h-screen bg-background\">
      {/* Header */}
      <header className=\"border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50\">
        <div className=\"max-w-6xl mx-auto px-4 py-4\">
          <div className=\"flex items-center justify-between\">
            <div className=\"flex items-center gap-3\">
              <div className=\"p-2 bg-primary/10 rounded-lg\">
                <Volume2 className=\"h-6 w-6 text-primary\" />
              </div>
              <div>
                <h1 className=\"text-xl font-semibold\">Text-to-Speech Converter</h1>
                <p className=\"text-sm text-muted-foreground\">Convert text to natural speech</p>
              </div>
            </div>
            <div className=\"flex items-center gap-3\">
              <Badge variant=\"secondary\">{user.email}</Badge>
              <Button variant=\"outline\" size=\"sm\" onClick={() => blink.auth.logout()}>
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className=\"max-w-6xl mx-auto px-4 py-8\">
        <div className=\"grid lg:grid-cols-3 gap-8\">
          {/* Main Converter */}
          <div className=\"lg:col-span-2 space-y-6\">
            <Card>
              <CardHeader>
                <CardTitle className=\"flex items-center gap-2\">
                  <Settings className=\"h-5 w-5\" />
                  Text Input
                </CardTitle>
              </CardHeader>
              <CardContent className=\"space-y-4\">
                <div className=\"space-y-2\">
                  <div className=\"flex items-center justify-between\">
                    <Label htmlFor=\"text-input\">Enter your text</Label>
                    <span className={`text-sm ${characterCount > characterLimit * 0.9 ? 'text-destructive' : 'text-muted-foreground'}`}>
                      {characterCount}/{characterLimit}
                    </span>
                  </div>
                  <Textarea
                    id=\"text-input\"
                    placeholder=\"Type or paste your text here to convert it to speech...\"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    className=\"min-h-[200px] resize-none\"
                    maxLength={characterLimit}
                  />
                </div>

                <div className=\"flex gap-2\">
                  <Button 
                    onClick={handleGenerate} 
                    disabled={!text.trim() || isGenerating}
                    className=\"flex-1\"
                  >
                    {isGenerating ? (
                      <>
                        <div className=\"animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2\"></div>
                        Generating...
                      </>
                    ) : (
                      'Generate Speech'
                    )}
                  </Button>
                  <Button variant=\"outline\" onClick={handleClear}>
                    <Trash2 className=\"h-4 w-4\" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Voice Controls */}
            <Card>
              <CardHeader>
                <CardTitle>Voice Settings</CardTitle>
              </CardHeader>
              <CardContent className=\"space-y-6\">
                <div className=\"grid md:grid-cols-2 gap-6\">
                  <div className=\"space-y-2\">
                    <Label>Voice</Label>
                    <Select value={voice} onValueChange={setVoice}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value=\"nova\">Nova (Female)</SelectItem>
                        <SelectItem value=\"alloy\">Alloy (Neutral)</SelectItem>
                        <SelectItem value=\"echo\">Echo (Male)</SelectItem>
                        <SelectItem value=\"fable\">Fable (British Male)</SelectItem>
                        <SelectItem value=\"onyx\">Onyx (Deep Male)</SelectItem>
                        <SelectItem value=\"shimmer\">Shimmer (Female)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className=\"space-y-2\">
                    <Label>Speed: {speed[0]}x</Label>
                    <Slider
                      value={speed}
                      onValueChange={setSpeed}
                      min={0.25}
                      max={4.0}
                      step={0.25}
                      className=\"w-full\"
                    />
                    <div className=\"flex justify-between text-xs text-muted-foreground\">
                      <span>0.25x</span>
                      <span>4.0x</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Audio Player */}
            {currentAudio && (
              <Card>
                <CardHeader>
                  <CardTitle>Audio Player</CardTitle>
                </CardHeader>
                <CardContent className=\"space-y-4\">
                  <Progress value={progress} className=\"w-full\" />
                  
                  <div className=\"flex items-center justify-center gap-2\">
                    <Button
                      variant=\"outline\"
                      size=\"sm\"
                      onClick={isPlaying ? handlePause : handlePlay}
                    >
                      {isPlaying ? <Pause className=\"h-4 w-4\" /> : <Play className=\"h-4 w-4\" />}
                    </Button>
                    <Button variant=\"outline\" size=\"sm\" onClick={handleStop}>
                      <Square className=\"h-4 w-4\" />
                    </Button>
                    <Separator orientation=\"vertical\" className=\"h-6\" />
                    <Button variant=\"outline\" size=\"sm\" onClick={handleDownload}>
                      <Download className=\"h-4 w-4\" />
                      Download
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* History Sidebar */}
          <div className=\"space-y-6\">
            <Card>
              <CardHeader>
                <CardTitle>Recent Conversions</CardTitle>
              </CardHeader>
              <CardContent>
                {history.length === 0 ? (
                  <p className=\"text-muted-foreground text-sm text-center py-8\">
                    No conversions yet. Generate your first speech!
                  </p>
                ) : (
                  <div className=\"space-y-3\">
                    {history.map((item) => (
                      <div key={item.id} className=\"p-3 border rounded-lg hover:bg-muted/50 transition-colors\">
                        <div className=\"flex items-start justify-between gap-2 mb-2\">
                          <p className=\"text-sm font-medium line-clamp-2\">{item.text}</p>
                          <Button
                            variant=\"ghost\"
                            size=\"sm\"
                            onClick={() => deleteFromHistory(item.id)}
                            className=\"h-6 w-6 p-0 text-muted-foreground hover:text-destructive\"
                          >
                            <Trash2 className=\"h-3 w-3\" />
                          </Button>
                        </div>
                        <div className=\"flex items-center justify-between text-xs text-muted-foreground mb-2\">
                          <span>{item.voice} • {item.speed}x</span>
                          <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                        </div>
                        <Button
                          variant=\"outline\"
                          size=\"sm\"
                          onClick={() => playFromHistory(item)}
                          className=\"w-full\"
                        >
                          <Play className=\"h-3 w-3 mr-1\" />
                          Load
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App"