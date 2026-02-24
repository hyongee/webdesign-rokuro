import { useRef, useEffect, useState } from 'react'
import './App.css'

interface Point {
  x: number
  y: number
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [scrollOffset, setScrollOffset] = useState(0)
  const [brushSize, setBrushSize] = useState(205) // medium
  const [scrollSpeed, setScrollSpeed] = useState(2) // px per frame
  const [canvasLength, setCanvasLength] = useState(5000) // User-configurable canvas length
  const [canvaslengthInput, setCanvasLengthInput] = useState('5000')
  const [isDrawing, setIsDrawing] = useState(false)
  const [lastPoint, setLastPoint] = useState<Point | null>(null)
  const [isFullPaintMode, setIsFullPaintMode] = useState(false)
  const [fullPaintStartY, setFullPaintStartY] = useState<number | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [isFullPaintActive, setIsFullPaintActive] = useState(false)
  const [cursorPosition, setCursorPosition] = useState<Point | null>(null)
  const [showCursor, setShowCursor] = useState(false)
  const [currentLoopIndex, setCurrentLoopIndex] = useState(0)

  const animationFrameRef = useRef<number | undefined>(undefined)

  // Drawing canvas - persistent, directly drawn to (no ImageData)
  const drawingCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const isDrawingRef = useRef(false)
  const currentDrawPointRef = useRef<Point | null>(null)
  const lastDrawTimeRef = useRef<number>(0)
  const scrollOffsetRef = useRef<number>(0)

  // Initialize drawing canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Set canvas size (17:8 aspect ratio, responsive to window width)
    const updateCanvasSize = () => {
      const width = Math.min(window.innerWidth * 0.9, 1200)
      const height = width * (8 / 17)
      canvas.width = width
      canvas.height = height

      // Recreate drawing canvas with new size
      const drawingCanvas = document.createElement('canvas')
      drawingCanvas.width = width
      drawingCanvas.height = canvasLength
      const ctx = drawingCanvas.getContext('2d', { willReadFrequently: true })
      if (ctx) {
        ctx.fillStyle = 'white'
        ctx.fillRect(0, 0, width, canvasLength)
      }
      drawingCanvasRef.current = drawingCanvas
    }

    updateCanvasSize()
    window.addEventListener('resize', updateCanvasSize)

    return () => {
      window.removeEventListener('resize', updateCanvasSize)
    }
  }, [canvasLength])

  // Unified animation loop for scrolling, drawing, and rendering
  useEffect(() => {
    if (!isRecording) return

    let localScrollOffset = scrollOffset

    const animate = () => {
      const canvas = canvasRef.current
      const drawingCanvas = drawingCanvasRef.current

      if (!canvas || !drawingCanvas) {
        animationFrameRef.current = requestAnimationFrame(animate)
        return
      }

      const drawingCtx = drawingCanvas.getContext('2d', { willReadFrequently: true })
      const displayCtx = canvas.getContext('2d')
      if (!drawingCtx || !displayCtx) {
        animationFrameRef.current = requestAnimationFrame(animate)
        return
      }

      // Update scroll offset (use local variable to avoid React state delays)
      localScrollOffset += scrollSpeed

      // Check if we've completed a loop
      if (localScrollOffset >= canvasLength) {
        setCurrentLoopIndex(idx => idx + 1)
        localScrollOffset = localScrollOffset - canvasLength
      }

      // Update both React state (for UI display) and ref (for drawing functions)
      setScrollOffset(localScrollOffset)
      scrollOffsetRef.current = localScrollOffset

      // Continuous drawing in normal mode
      if (isDrawingRef.current && currentDrawPointRef.current && !isFullPaintActive) {
        const point = currentDrawPointRef.current
        const virtualY = (point.y + localScrollOffset) % canvasLength // Wrap around for loop recording

        drawingCtx.fillStyle = '#000000'
        const brushWidth = brushSize
        const brushHeight = brushSize / 8
        drawingCtx.fillRect(
          point.x - brushWidth / 2,
          virtualY - brushHeight / 2,
          brushWidth,
          brushHeight
        )
      }

      // Continuous drawing in Full Paint Mode
      if (isFullPaintActive && fullPaintStartY !== null) {
        const virtualY = (fullPaintStartY + localScrollOffset) % canvasLength // Wrap around for loop recording

        drawingCtx.fillStyle = '#000000'
        drawingCtx.fillRect(0, virtualY - 2, canvas.width, 4)
      }

      // Render to display canvas (moved here from useEffect)
      displayCtx.fillStyle = 'white'
      displayCtx.fillRect(0, 0, canvas.width, canvas.height)

      const availableHeight = canvasLength - localScrollOffset

      if (availableHeight >= canvas.height) {
        // Simple case: enough space to show full viewport
        displayCtx.drawImage(
          drawingCanvas,
          0, localScrollOffset,
          canvas.width, canvas.height,
          0, 0,
          canvas.width, canvas.height
        )
      } else {
        // Near end: show what's available from current position
        displayCtx.drawImage(
          drawingCanvas,
          0, localScrollOffset,
          canvas.width, availableHeight,
          0, 0,
          canvas.width, availableHeight
        )
        // Show the beginning of the canvas for the remaining space (loop visualization)
        const remainingHeight = canvas.height - availableHeight
        displayCtx.drawImage(
          drawingCanvas,
          0, 0,
          canvas.width, remainingHeight,
          0, availableHeight,
          canvas.width, remainingHeight
        )
      }

      animationFrameRef.current = requestAnimationFrame(animate)
    }

    animationFrameRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [isRecording, scrollSpeed, brushSize, isFullPaintActive, fullPaintStartY, canvasLength])

  // Keyboard event listener for Shift (Full Paint) and Space (Start/Stop Recording)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Shift key for Full Paint Mode
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        if (!e.repeat && isRecording) {
          e.preventDefault()
          setIsFullPaintMode(true)
        }
      }

      // Space key for Start/Stop Recording
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault()
        if (isRecording) {
          stopRecording()
        } else {
          startRecording()
        }
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        e.preventDefault()
        setIsFullPaintMode(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [isRecording])

  const startRecording = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Create new drawing canvas for this session
    const drawingCanvas = document.createElement('canvas')
    drawingCanvas.width = canvas.width
    drawingCanvas.height = canvasLength
    const ctx = drawingCanvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return

    // Initialize with white background
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, drawingCanvas.width, drawingCanvas.height)

    drawingCanvasRef.current = drawingCanvas

    setIsRecording(true)
    setScrollOffset(0)
    setCurrentLoopIndex(0)
  }

  const stopRecording = () => {
    setIsRecording(false)
  }

  const drawBrush = (x: number, y: number) => {
    const canvas = canvasRef.current
    const drawingCanvas = drawingCanvasRef.current
    if (!canvas || !drawingCanvas) return

    // Use ref instead of state to get the latest value
    const currentScrollOffset = scrollOffsetRef.current
    const virtualY = (y + currentScrollOffset) % canvasLength // Wrap around for loop recording
    const ctx = drawingCanvas.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = '#000000'
    const brushWidth = brushSize
    const brushHeight = brushSize / 8
    ctx.fillRect(x - brushWidth / 2, virtualY - brushHeight / 2, brushWidth, brushHeight)
  }

  // Optimized drawLine using efficient interpolation
  const drawLine = (x1: number, y1: number, x2: number, y2: number) => {
    const canvas = canvasRef.current
    const drawingCanvas = drawingCanvasRef.current
    if (!canvas || !drawingCanvas) return

    const ctx = drawingCanvas.getContext('2d')
    if (!ctx) return

    // Use ref instead of state to get the latest value
    const currentScrollOffset = scrollOffsetRef.current

    const distance = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
    const brushHeight = brushSize / 8

    // Optimize steps based on brush size - fewer steps for larger brushes
    const steps = Math.ceil(distance / Math.max(brushHeight * 0.5, 1))

    ctx.fillStyle = '#000000'
    const brushWidth = brushSize

    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const x = x1 + (x2 - x1) * t
      const y = y1 + (y2 - y1) * t
      const virtualY = (y + currentScrollOffset) % canvasLength // Wrap around for loop recording

      ctx.fillRect(x - brushWidth / 2, virtualY - brushHeight / 2, brushWidth, brushHeight)
    }
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isRecording) return

    e.preventDefault()

    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    if (isFullPaintMode) {
      setFullPaintStartY(y)
      setIsFullPaintActive(true)
    } else {
      setIsDrawing(true)
      isDrawingRef.current = true
      setLastPoint({ x, y })
      currentDrawPointRef.current = { x, y }
      drawBrush(x, y)
    }
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    setCursorPosition({ x, y })

    if (!isRecording) return

    e.preventDefault()

    if (isFullPaintMode && fullPaintStartY !== null) {
      setFullPaintStartY(y)
      drawFullWidthBand(fullPaintStartY, y)
    } else if (isDrawing && lastPoint) {
      // Throttle drawing updates for better performance
      const now = performance.now()
      if (now - lastDrawTimeRef.current > 8) { // ~120 FPS limit
        drawLine(lastPoint.x, lastPoint.y, x, y)
        setLastPoint({ x, y })
        currentDrawPointRef.current = { x, y }
        lastDrawTimeRef.current = now
      }
    } else if (isDrawing) {
      // Update current draw point even when not moving much
      currentDrawPointRef.current = { x, y }
    }
  }

  const handleCanvasMouseEnter = () => {
    setShowCursor(true)
  }

  const handleCanvasMouseLeave = () => {
    setShowCursor(false)
    setCursorPosition(null)
  }

  const handlePointerUp = () => {
    setIsDrawing(false)
    isDrawingRef.current = false
    setLastPoint(null)
    setFullPaintStartY(null)
    setIsFullPaintActive(false)
    currentDrawPointRef.current = null
  }

  const drawFullWidthBand = (startY: number, endY: number) => {
    const canvas = canvasRef.current
    const drawingCanvas = drawingCanvasRef.current
    if (!canvas || !drawingCanvas) return

    // Use ref instead of state to get the latest value
    const currentScrollOffset = scrollOffsetRef.current
    const virtualStartY = (startY + currentScrollOffset) % canvasLength
    const virtualEndY = (endY + currentScrollOffset) % canvasLength

    const ctx = drawingCanvas.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = '#000000'
    const minY = Math.min(virtualStartY, virtualEndY)
    const maxY = Math.max(virtualStartY, virtualEndY)

    ctx.fillRect(0, minY, canvas.width, maxY - minY)
  }

  const handleClear = () => {
    const canvas = canvasRef.current
    const drawingCanvas = drawingCanvasRef.current
    if (!canvas || !drawingCanvas) return

    const ctx = drawingCanvas.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, drawingCanvas.width, drawingCanvas.height)

    setCurrentLoopIndex(0)
    setScrollOffset(0)
  }

  const handleUndoLastLoop = () => {
    // Temporarily disabled - will implement with proper drawing history
    alert('Undo Last Loop feature is temporarily disabled for performance optimization')
    return
  }

  const handleExport = () => {
    const canvas = canvasRef.current
    const drawingCanvas = drawingCanvasRef.current
    if (!canvas || !drawingCanvas) return

    // Create export canvas with the set canvas length
    const exportCanvas = document.createElement('canvas')
    exportCanvas.width = canvas.width
    exportCanvas.height = canvasLength
    const exportCtx = exportCanvas.getContext('2d')
    if (!exportCtx) return

    // White background
    exportCtx.fillStyle = 'white'
    exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height)

    // Draw the entire drawing canvas
    exportCtx.drawImage(drawingCanvas, 0, 0)

    // Download
    exportCanvas.toBlob(blob => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `web-design-rokuro-${Date.now()}.png`
      a.click()
      URL.revokeObjectURL(url)
    })
  }

  const handleCanvasLengthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setCanvasLengthInput(value)

    const numValue = parseInt(value, 10)
    if (!isNaN(numValue) && numValue >= 2000 && numValue <= 10000) {
      setCanvasLength(numValue)
    }
  }

  const handleCanvasLengthBlur = () => {
    const numValue = parseInt(canvaslengthInput, 10)
    if (isNaN(numValue) || numValue < 2000) {
      setCanvasLengthInput('2000')
      setCanvasLength(2000)
    } else if (numValue > 10000) {
      setCanvasLengthInput('10000')
      setCanvasLength(10000)
    }
  }

  return (
    <div className="app">
      <div className="canvas-container">
        <canvas
          ref={canvasRef}
          className="canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onMouseEnter={handleCanvasMouseEnter}
          onMouseLeave={handleCanvasMouseLeave}
        />

        {/* Brush preview cursor */}
        {showCursor && cursorPosition && canvasRef.current && (
          <div
            className="brush-cursor"
            style={{
              left: `${canvasRef.current.getBoundingClientRect().left + cursorPosition.x}px`,
              top: `${canvasRef.current.getBoundingClientRect().top + cursorPosition.y}px`,
              width: `${brushSize}px`,
              height: `${brushSize / 8}px`,
            }}
          />
        )}

        <div className="canvas-controls">
          {/* Top Left: Canvas settings */}
          <div className="top-left">
            <div className="canvas-length-input">
              <label htmlFor="canvas-length">Canvas Length (px)</label>
              <input
                id="canvas-length"
                type="number"
                min="2000"
                max="10000"
                step="100"
                value={canvaslengthInput}
                onChange={handleCanvasLengthChange}
                onBlur={handleCanvasLengthBlur}
                disabled={isRecording}
              />
            </div>
            <button
              className="settings-btn"
              onClick={() => setShowSettings(!showSettings)}
              disabled={isRecording}
            >
              Settings
            </button>
          </div>

          {/* Top Right: Drawing actions */}
          <div className="top-right">
            <button onClick={handleUndoLastLoop} disabled={!isRecording}>
              Undo
            </button>
            <button onClick={handleClear}>Clear</button>
            <button onClick={handleExport}>Export</button>
          </div>
        </div>

        {/* Bottom Center: Recording control with progress */}
        <div className="canvas-bottom-controls">
          <button
            onClick={isRecording ? stopRecording : startRecording}
            className={`recording-btn ${isRecording ? 'recording' : ''}`}
          >
            <span className="recording-label">
              {isRecording ? 'Stop Recording (Space)' : 'Start Recording (Space)'}
            </span>
            {isRecording && (
              <span className="recording-progress">
                {Math.floor(scrollOffset)}px / {canvasLength}px (Loop {currentLoopIndex + 1})
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="controls">
        {/* Top Center: App title */}
        <div className="top-center">
          <div className="app-title">Web Design Rokuro</div>
        </div>

        {/* Full Paint Mode button - hidden for now, activated by Shift key */}
        {isRecording && isFullPaintMode && (
          <div className="full-paint-indicator">
            Full Paint Mode Active
          </div>
        )}
      </div>

      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Settings</h2>

            <div className="setting-group">
              <label>Brush Size</label>
              <div className="button-group">
                <button
                  className={brushSize === 10 ? 'active' : ''}
                  onClick={() => setBrushSize(10)}
                >
                  Small
                </button>
                <button
                  className={brushSize === 205 ? 'active' : ''}
                  onClick={() => setBrushSize(205)}
                >
                  Medium
                </button>
                <button
                  className={brushSize === 400 ? 'active' : ''}
                  onClick={() => setBrushSize(400)}
                >
                  Large
                </button>
              </div>
            </div>

            <div className="setting-group">
              <label>Scroll Speed</label>
              <div className="button-group">
                <button
                  className={scrollSpeed === 1 ? 'active' : ''}
                  onClick={() => setScrollSpeed(1)}
                >
                  Slow
                </button>
                <button
                  className={scrollSpeed === 2 ? 'active' : ''}
                  onClick={() => setScrollSpeed(2)}
                >
                  Medium
                </button>
                <button
                  className={scrollSpeed === 4 ? 'active' : ''}
                  onClick={() => setScrollSpeed(4)}
                >
                  Fast
                </button>
              </div>
            </div>

            <button onClick={() => setShowSettings(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
