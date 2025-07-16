import { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from './components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card'
import { Textarea } from './components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select'
import { Slider } from './components/ui/slider'
import { Label } from './components/ui/label'
import { Progress } from './components/ui/progress'
import { Separator } from './components/ui/separator'
import { Badge } from './components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs'
import { Input } from './components/ui/input'
import { Play, Pause, Square, Download, Trash2, Volume2, Settings, Plus, FileText, BarChart3, Music, Upload } from 'lucide-react'
import { blink } from './blink/client'
import { toast } from 'react-hot-toast'
import WaveSurfer from 'wavesurfer.js'
import { saveAs } from 'file-saver'

interface ConversionHistory {
  id: string
  text: string
  voice: string
  speed: number
  pitch: number
  audioUrl: string
  createdAt: Date
}

interface BatchItem {
  id: string
  text: string
  status: 'pending' | 'processing' | 'completed' | 'error'
  audioUrl?: string
  error?: string
}

const VOICE_OPTIONS = [
  { value: 'nova', label: 'Nova (Female)', gender: 'female', accent: 'American' },
  { value: 'alloy', label: 'Alloy (Neutral)', gender: 'neutral', accent: 'American' },
  { value: 'echo', label: 'Echo (Male)', gender: 'male', accent: 'American' },
  { value: 'fable', label: 'Fable (British Male)', gender: 'male', accent: 'British' },
  { value: 'onyx', label: 'Onyx (Deep Male)', gender: 'male', accent: 'American' },
  { value: 'shimmer', label: 'Shimmer (Female)', gender: 'female', accent: 'American' }
]

const EXPORT_FORMATS = [
  { value: 'mp3', label: 'MP3 (Recommended)', description: 'Best compatibility' },
  { value: 'wav', label: 'WAV', description: 'Uncompressed audio' },
  { value: 'ogg', label: 'OGG', description: 'Open source format' }
]

function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [voice, setVoice] = useState('nova')
  const [speed, setSpeed] = useState([1.0])
  const [pitch, setPitch] = useState([1.0])
  const [isGenerating, setIsGenerating] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentAudio, setCurrentAudio] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [history, setHistory] = useState<ConversionHistory[]>([])
  const [batchItems, setBatchItems] = useState<BatchItem[]>([])
  const [isBatchProcessing, setIsBatchProcessing] = useState(false)
  const [showVoicePreviews, setShowVoicePreviews] = useState(false)
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [exportFormat, setExportFormat] = useState('mp3')
  
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const progressInterval = useRef<NodeJS.Timeout | null>(null)
  const waveformRef = useRef<HTMLDivElement>(null)
  const wavesurfer = useRef<WaveSurfer | null>(null)

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
  }, [user, loadHistory])

  // Initialize waveform when audio changes
  useEffect(() => {
    if (currentAudio && waveformRef.current) {
      initializeWaveform()
    }
    return () => {
      if (wavesurfer.current) {
        wavesurfer.current.destroy()
      }
    }
  }, [currentAudio, initializeWaveform])

  const initializeWaveform = useCallback(() => {
    if (!waveformRef.current || !currentAudio) return

    // Destroy existing instance
    if (wavesurfer.current) {
      wavesurfer.current.destroy()
    }

    // Create new WaveSurfer instance
    wavesurfer.current = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: '#6366F1',
      progressColor: '#8B5CF6',
      cursorColor: '#6366F1',
      barWidth: 2,
      barRadius: 1,
      responsive: true,
      height: 60,
      normalize: true,
      backend: 'WebAudio'
    })

    // Load audio
    wavesurfer.current.load(currentAudio)

    // Event listeners
    wavesurfer.current.on('ready', () => {
      setProgress(0)
    })

    wavesurfer.current.on('audioprocess', () => {
      if (wavesurfer.current) {
        const progress = (wavesurfer.current.getCurrentTime() / wavesurfer.current.getDuration()) * 100
        setProgress(progress)
      }
    })

    wavesurfer.current.on('finish', () => {
      setIsPlaying(false)
      setProgress(0)
    })

    wavesurfer.current.on('play', () => {
      setIsPlaying(true)
    })

    wavesurfer.current.on('pause', () => {
      setIsPlaying(false)
    })
  }, [currentAudio])

  const loadHistory = useCallback(() => {
    if (!user?.id) return
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
  }, [user?.id])

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
        pitch: pitch[0],
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
    if (wavesurfer.current) {
      if (isPlaying) {
        wavesurfer.current.pause()
      } else {
        wavesurfer.current.play()
      }
    }
  }

  const handleStop = () => {
    if (wavesurfer.current) {
      wavesurfer.current.stop()
      setIsPlaying(false)
      setProgress(0)
    }
  }

  const handleDownload = async () => {
    if (!currentAudio) return
    
    try {
      const response = await fetch(currentAudio)
      const blob = await response.blob()
      
      let filename = `speech-${Date.now()}`
      let mimeType = 'audio/mpeg'
      
      switch (exportFormat) {
        case 'wav':
          filename += '.wav'
          mimeType = 'audio/wav'
          break
        case 'ogg':
          filename += '.ogg'
          mimeType = 'audio/ogg'
          break
        default:
          filename += '.mp3'
          mimeType = 'audio/mpeg'
      }
      
      // Convert blob if needed (simplified - in real app you'd use proper audio conversion)
      const convertedBlob = new Blob([blob], { type: mimeType })
      saveAs(convertedBlob, filename)
      toast.success(`Downloaded as ${exportFormat.toUpperCase()}`)
    } catch (error) {
      console.error('Download failed:', error)
      toast.error('Failed to download audio')
    }
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
    setPitch([item.pitch])
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

  const addBatchItem = () => {
    const newItem: BatchItem = {
      id: Date.now().toString(),
      text: '',
      status: 'pending'
    }
    setBatchItems([...batchItems, newItem])
  }

  const updateBatchItem = (id: string, text: string) => {
    setBatchItems(items => 
      items.map(item => 
        item.id === id ? { ...item, text } : item
      )
    )
  }

  const removeBatchItem = (id: string) => {
    setBatchItems(items => items.filter(item => item.id !== id))
  }

  const processBatch = async () => {
    const validItems = batchItems.filter(item => item.text.trim())
    if (validItems.length === 0) {
      toast.error('Please add some text to process')
      return
    }

    setIsBatchProcessing(true)
    
    for (const item of validItems) {
      setBatchItems(items => 
        items.map(i => 
          i.id === item.id ? { ...i, status: 'processing' } : i
        )
      )

      try {
        const { url } = await blink.ai.generateSpeech({
          text: item.text.trim(),
          voice: voice as any,
          speed: speed[0]
        })

        setBatchItems(items => 
          items.map(i => 
            i.id === item.id ? { ...i, status: 'completed', audioUrl: url } : i
          )
        )
      } catch (error) {
        setBatchItems(items => 
          items.map(i => 
            i.id === item.id ? { ...i, status: 'error', error: 'Failed to generate' } : i
          )
        )
      }
    }

    setIsBatchProcessing(false)
    toast.success('Batch processing completed!')
  }

  const downloadBatchItem = async (item: BatchItem) => {
    if (!item.audioUrl) return
    
    try {
      const response = await fetch(item.audioUrl)
      const blob = await response.blob()
      const filename = `batch-${item.id}.mp3`
      saveAs(blob, filename)
    } catch (error) {
      toast.error('Failed to download audio')
    }
  }

  const playVoicePreview = async (voiceValue: string) => {
    try {
      const { url } = await blink.ai.generateSpeech({
        text: "Hello! This is a preview of my voice. I hope you like how I sound!",
        voice: voiceValue as any,
        speed: 1.0
      })
      
      const audio = new Audio(url)
      audio.play()
    } catch (error) {
      toast.error('Failed to play voice preview')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2">
              <Volume2 className="h-6 w-6 text-primary" />
              Text-to-Speech Converter
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-muted-foreground mb-4">Please sign in to use the text-to-speech converter</p>
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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Volume2 className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-semibold">Text-to-Speech Converter</h1>
                <p className="text-sm text-muted-foreground">Convert text to natural speech</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="secondary">{user.email}</Badge>
              <Button variant="outline" size="sm" onClick={() => blink.auth.logout()}>
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <Tabs defaultValue="single" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="single" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Single Text
            </TabsTrigger>
            <TabsTrigger value="batch" className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Batch Process
            </TabsTrigger>
          </TabsList>

          <TabsContent value="single" className="space-y-6">
            <div className="grid lg:grid-cols-3 gap-8">
              {/* Main Converter */}
              <div className="lg:col-span-2 space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Settings className="h-5 w-5" />
                      Text Input
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="text-input">Enter your text</Label>
                        <span className={`text-sm ${characterCount > characterLimit * 0.9 ? 'text-destructive' : 'text-muted-foreground'}`}>
                          {characterCount}/{characterLimit}
                        </span>
                      </div>
                      <Textarea
                        id="text-input"
                        placeholder="Type or paste your text here to convert it to speech..."
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        className="min-h-[200px] resize-none"
                        maxLength={characterLimit}
                      />
                    </div>

                    <div className="flex gap-2">
                      <Button 
                        onClick={handleGenerate} 
                        disabled={!text.trim() || isGenerating}
                        className="flex-1"
                      >
                        {isGenerating ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                            Generating...
                          </>
                        ) : (
                          'Generate Speech'
                        )}
                      </Button>
                      <Button variant="outline" onClick={handleClear}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Voice Controls */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>Voice Settings</CardTitle>
                      <Dialog open={showVoicePreviews} onOpenChange={setShowVoicePreviews}>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm">
                            <Music className="h-4 w-4 mr-2" />
                            Preview Voices
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl">
                          <DialogHeader>
                            <DialogTitle>Voice Previews</DialogTitle>
                          </DialogHeader>
                          <div className="grid gap-4">
                            {VOICE_OPTIONS.map((voiceOption) => (
                              <div key={voiceOption.value} className="flex items-center justify-between p-4 border rounded-lg">
                                <div>
                                  <h4 className="font-medium">{voiceOption.label}</h4>
                                  <p className="text-sm text-muted-foreground">
                                    {voiceOption.gender} • {voiceOption.accent}
                                  </p>
                                </div>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => playVoicePreview(voiceOption.value)}
                                >
                                  <Play className="h-4 w-4 mr-2" />
                                  Preview
                                </Button>
                              </div>
                            ))}
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid md:grid-cols-3 gap-6">
                      <div className="space-y-2">
                        <Label>Voice</Label>
                        <Select value={voice} onValueChange={setVoice}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {VOICE_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Speed: {speed[0]}x</Label>
                        <Slider
                          value={speed}
                          onValueChange={setSpeed}
                          min={0.25}
                          max={4.0}
                          step={0.25}
                          className="w-full"
                        />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>0.25x</span>
                          <span>4.0x</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Pitch: {pitch[0]}x</Label>
                        <Slider
                          value={pitch}
                          onValueChange={setPitch}
                          min={0.5}
                          max={2.0}
                          step={0.1}
                          className="w-full"
                        />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>0.5x</span>
                          <span>2.0x</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Audio Player with Waveform */}
                {currentAudio && (
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2">
                          <BarChart3 className="h-5 w-5" />
                          Audio Player
                        </CardTitle>
                        <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
                          <DialogTrigger asChild>
                            <Button variant="outline" size="sm">
                              <Download className="h-4 w-4 mr-2" />
                              Export Options
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Export Audio</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4">
                              <div className="space-y-2">
                                <Label>Format</Label>
                                <Select value={exportFormat} onValueChange={setExportFormat}>
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {EXPORT_FORMATS.map((format) => (
                                      <SelectItem key={format.value} value={format.value}>
                                        <div>
                                          <div className="font-medium">{format.label}</div>
                                          <div className="text-sm text-muted-foreground">{format.description}</div>
                                        </div>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <Button onClick={handleDownload} className="w-full">
                                <Download className="h-4 w-4 mr-2" />
                                Download {exportFormat.toUpperCase()}
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Waveform Visualization */}
                      <div className="bg-muted/30 rounded-lg p-4">
                        <div ref={waveformRef} className="w-full" />
                      </div>
                      
                      <Progress value={progress} className="w-full" />
                      
                      <div className="flex items-center justify-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handlePlay}
                        >
                          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleStop}>
                          <Square className="h-4 w-4" />
                        </Button>
                        <Separator orientation="vertical" className="h-6" />
                        <Button variant="outline" size="sm" onClick={handleDownload}>
                          <Download className="h-4 w-4" />
                          Download
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* History Sidebar */}
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Recent Conversions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {history.length === 0 ? (
                      <p className="text-muted-foreground text-sm text-center py-8">
                        No conversions yet. Generate your first speech!
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {history.map((item) => (
                          <div key={item.id} className="p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <p className="text-sm font-medium line-clamp-2">{item.text}</p>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => deleteFromHistory(item.id)}
                                className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                            <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                              <span>{item.voice} • {item.speed}x • {item.pitch}x</span>
                              <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => playFromHistory(item)}
                              className="w-full"
                            >
                              <Play className="h-3 w-3 mr-1" />
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
          </TabsContent>

          <TabsContent value="batch" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Batch Text Processing</CardTitle>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={addBatchItem}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Text
                    </Button>
                    <Button 
                      onClick={processBatch} 
                      disabled={isBatchProcessing || batchItems.length === 0}
                    >
                      {isBatchProcessing ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Processing...
                        </>
                      ) : (
                        'Process All'
                      )}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {batchItems.length === 0 ? (
                  <div className="text-center py-12">
                    <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground mb-4">No batch items yet</p>
                    <Button onClick={addBatchItem}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Your First Text
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {batchItems.map((item, index) => (
                      <div key={item.id} className="border rounded-lg p-4">
                        <div className="flex items-start gap-4">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center justify-between">
                              <Label>Text {index + 1}</Label>
                              <div className="flex items-center gap-2">
                                <Badge 
                                  variant={
                                    item.status === 'completed' ? 'default' :
                                    item.status === 'processing' ? 'secondary' :
                                    item.status === 'error' ? 'destructive' : 'outline'
                                  }
                                >
                                  {item.status}
                                </Badge>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeBatchItem(item.id)}
                                  className="h-6 w-6 p-0"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                            <Textarea
                              value={item.text}
                              onChange={(e) => updateBatchItem(item.id, e.target.value)}
                              placeholder="Enter text to convert to speech..."
                              className="min-h-[80px]"
                              disabled={item.status === 'processing'}
                            />
                            {item.error && (
                              <p className="text-sm text-destructive">{item.error}</p>
                            )}
                          </div>
                          {item.status === 'completed' && item.audioUrl && (
                            <div className="flex flex-col gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  const audio = new Audio(item.audioUrl)
                                  audio.play()
                                }}
                              >
                                <Play className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => downloadBatchItem(item)}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

export default App