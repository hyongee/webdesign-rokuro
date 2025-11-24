import { useRef, useEffect, useState } from 'react'
import './App.css'
import settingsIcon from './assets/Icon_Settings.svg'

interface Point {
  x: number
  y: number
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [scrollOffset, setScrollOffset] = useState(0)
  const [drawingLayer, setDrawingLayer] = useState<ImageData | null>(null)
  const [brushSize, setBrushSize] = useState(205) // medium
  const [scrollSpeed, setScrollSpeed] = useState(2) // px per frame
  const [isDrawing, setIsDrawing] = useState(false)
  const [lastPoint, setLastPoint] = useState<Point | null>(null)
  const [isFullPaintMode, setIsFullPaintMode] = useState(false)
  const [fullPaintStartY, setFullPaintStartY] = useState<number | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [isFullPaintActive, setIsFullPaintActive] = useState(false)
  const [maxScrollOffset, setMaxScrollOffset] = useState(0)
  const [cursorPosition, setCursorPosition] = useState<Point | null>(null)
  const [showCursor, setShowCursor] = useState(false)
  const [hasRecorded, setHasRecorded] = useState(false)

  const animationFrameRef = useRef<number | undefined>(undefined)
  const drawingAnimationRef = useRef<number | undefined>(undefined)
  const canvasHeight = 10000 // Virtual canvas height
  const tempCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const isDrawingRef = useRef(false)
  const lastDrawTimeRef = useRef(0)
  const currentDrawPointRef = useRef<Point | null>(null)
  const lastScrollOffsetRef = useRef(0)

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas size (17:8 aspect ratio, responsive to window width)
    const updateCanvasSize = () => {
      const width = Math.min(window.innerWidth * 0.9, 1200)
      const height = width * (8 / 17)
      canvas.width = width
      canvas.height = height
    }

    updateCanvasSize()
    window.addEventListener('resize', updateCanvasSize)

    // Initialize with white background
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, canvas.width, canvasHeight)

    return () => {
      window.removeEventListener('resize', updateCanvasSize)
    }
  }, [])

  // Auto-scroll animation
  useEffect(() => {
    if (!isRecording) return

    const animate = () => {
      setScrollOffset(prev => {
        const newOffset = prev + scrollSpeed
        // Track maximum scroll offset for export
        setMaxScrollOffset(current => Math.max(current, newOffset))
        // Loop back if we exceed canvas height
        return newOffset >= canvasHeight ? 0 : newOffset
      })
      animationFrameRef.current = requestAnimationFrame(animate)
    }

    animationFrameRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [isRecording, scrollSpeed])

  // Initialize temp canvas for drawing operations (update on canvas size change)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = canvas.width
    tempCanvas.height = canvasHeight
    tempCanvasRef.current = tempCanvas
  }, [canvasRef.current?.width])

  // Optimized continuous drawing animation
  useEffect(() => {
    if (!isRecording) {
      if (drawingAnimationRef.current) {
        cancelAnimationFrame(drawingAnimationRef.current)
        drawingAnimationRef.current = undefined
      }
      return
    }

    let lastUpdateTime = 0
    const updateInterval = 1000 / 60 // 60 FPS throttle for state updates

    const animate = (currentTime: number) => {
      const canvas = canvasRef.current
      const tempCanvas = tempCanvasRef.current
      if (!canvas || !tempCanvas || !drawingLayer) {
        drawingAnimationRef.current = requestAnimationFrame(animate)
        return
      }

      const tempCtx = tempCanvas.getContext('2d')
      if (!tempCtx) {
        drawingAnimationRef.current = requestAnimationFrame(animate)
        return
      }

      let shouldUpdate = false

      // Draw continuously if pointer is down in normal mode
      if (isDrawingRef.current && currentDrawPointRef.current && !isFullPaintActive) {
        // Put drawing layer on temp canvas
        tempCtx.putImageData(drawingLayer, 0, 0)

        // Draw at the current point with current scroll offset (horizontal rectangle 8:1)
        const virtualY = currentDrawPointRef.current.y + scrollOffset
        tempCtx.fillStyle = '#000000'
        const brushWidth = brushSize
        const brushHeight = brushSize / 8
        tempCtx.fillRect(
          currentDrawPointRef.current.x - brushWidth / 2,
          virtualY - brushHeight / 2,
          brushWidth,
          brushHeight
        )
        shouldUpdate = true
      }

      // Draw continuously in Full Paint Mode when active
      if (isFullPaintActive && fullPaintStartY !== null) {
        // Put drawing layer on temp canvas
        tempCtx.putImageData(drawingLayer, 0, 0)

        // Draw full width band at the touch position
        const virtualY = fullPaintStartY + scrollOffset
        tempCtx.fillStyle = '#000000'
        tempCtx.fillRect(0, virtualY - 2, canvas.width, 4)
        shouldUpdate = true
      }

      // Only update state at throttled interval to avoid excessive re-renders
      if (shouldUpdate && currentTime - lastUpdateTime >= updateInterval) {
        const updatedLayer = tempCtx.getImageData(0, 0, canvas.width, canvasHeight)
        setDrawingLayer(updatedLayer)
        lastUpdateTime = currentTime
      }

      drawingAnimationRef.current = requestAnimationFrame(animate)
    }

    drawingAnimationRef.current = requestAnimationFrame(animate)

    return () => {
      if (drawingAnimationRef.current) {
        cancelAnimationFrame(drawingAnimationRef.current)
      }
    }
  }, [isRecording, drawingLayer, scrollOffset, brushSize, isFullPaintActive, fullPaintStartY])

  // Keyboard event listener for Space key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault()
        setIsFullPaintMode(true)
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
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
  }, [])

  // Render canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Clear and draw white background
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Create a temporary canvas for the full virtual canvas
    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = canvas.width
    tempCanvas.height = canvasHeight
    const tempCtx = tempCanvas.getContext('2d')
    if (!tempCtx) return

    // Draw white background on temp canvas
    tempCtx.fillStyle = 'white'
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height)

    // Draw the single drawing layer if exists
    if (drawingLayer) {
      tempCtx.putImageData(drawingLayer, 0, 0)
    }

    // Copy visible portion to main canvas
    ctx.drawImage(
      tempCanvas,
      0, scrollOffset,
      canvas.width, canvas.height,
      0, 0,
      canvas.width, canvas.height
    )
  }, [scrollOffset, drawingLayer])

  const startRecording = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Update temp canvas size to match current canvas size
    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = canvas.width
    tempCanvas.height = canvasHeight
    tempCanvasRef.current = tempCanvas

    // Create new drawing layer for this single recording session
    const tempCtx = tempCanvas.getContext('2d')
    if (!tempCtx) return

    // Initialize with transparent
    tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height)
    const newLayerData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height)
    setDrawingLayer(newLayerData)

    setIsRecording(true)
    setScrollOffset(0)
    setMaxScrollOffset(0)
  }

  const stopRecording = () => {
    setIsRecording(false)
    setHasRecorded(true)
  }

  const drawBrush = (x: number, y: number) => {
    if (!drawingLayer) return

    const canvas = canvasRef.current
    if (!canvas) return

    // Convert screen coordinates to virtual canvas coordinates
    const virtualY = y + scrollOffset

    // Draw on drawing layer
    const tempCanvas = tempCanvasRef.current
    if (!tempCanvas) return

    const tempCtx = tempCanvas.getContext('2d')
    if (!tempCtx) return

    tempCtx.putImageData(drawingLayer, 0, 0)

    // Use solid black color (100% opacity) and horizontal rectangular brush (8:1 aspect ratio)
    tempCtx.fillStyle = '#000000'
    const brushWidth = brushSize
    const brushHeight = brushSize / 8
    tempCtx.fillRect(x - brushWidth / 2, virtualY - brushHeight / 2, brushWidth, brushHeight)

    const updatedLayer = tempCtx.getImageData(0, 0, canvas.width, canvasHeight)
    setDrawingLayer(updatedLayer)
  }

  const drawLine = (x1: number, y1: number, x2: number, y2: number) => {
    if (!drawingLayer) return

    const canvas = canvasRef.current
    const tempCanvas = tempCanvasRef.current
    if (!canvas || !tempCanvas) return

    const tempCtx = tempCanvas.getContext('2d')
    if (!tempCtx) return

    tempCtx.putImageData(drawingLayer, 0, 0)

    // Draw line as series of horizontal rectangles (8:1 aspect ratio) for better performance
    const distance = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
    const brushHeight = brushSize / 8
    const steps = Math.max(Math.floor(distance / (brushHeight / 2)), 1)

    tempCtx.fillStyle = '#000000'
    const brushWidth = brushSize

    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const x = x1 + (x2 - x1) * t
      const y = y1 + (y2 - y1) * t
      const virtualY = y + scrollOffset
      tempCtx.fillRect(x - brushWidth / 2, virtualY - brushHeight / 2, brushWidth, brushHeight)
    }

    const updatedLayer = tempCtx.getImageData(0, 0, canvas.width, canvasHeight)
    setDrawingLayer(updatedLayer)
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isRecording) return

    // Prevent default browser behavior (drag, text selection, etc.)
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

    // Update cursor position for preview
    setCursorPosition({ x, y })

    if (!isRecording) return

    // Prevent default browser behavior (drag, text selection, etc.)
    e.preventDefault()

    if (isFullPaintMode && fullPaintStartY !== null) {
      // Update the y position for continuous full paint mode
      setFullPaintStartY(y)
      // Also draw the band between start and current for drag effect
      drawFullWidthBand(fullPaintStartY, y)
    } else if (isDrawing && lastPoint) {
      drawLine(lastPoint.x, lastPoint.y, x, y)
      setLastPoint({ x, y })
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
    if (!drawingLayer) return

    const canvas = canvasRef.current
    const tempCanvas = tempCanvasRef.current
    if (!canvas || !tempCanvas) return

    const virtualStartY = startY + scrollOffset
    const virtualEndY = endY + scrollOffset

    const tempCtx = tempCanvas.getContext('2d')
    if (!tempCtx) return

    tempCtx.putImageData(drawingLayer, 0, 0)

    tempCtx.fillStyle = '#000000'
    const minY = Math.min(virtualStartY, virtualEndY)
    const maxY = Math.max(virtualStartY, virtualEndY)
    tempCtx.fillRect(0, minY, canvas.width, maxY - minY)

    const updatedLayer = tempCtx.getImageData(0, 0, canvas.width, canvasHeight)
    setDrawingLayer(updatedLayer)
  }

  const handleClear = () => {
    setDrawingLayer(null)
    setHasRecorded(false)
  }

  const handleExport = () => {
    const canvas = canvasRef.current
    if (!canvas || !drawingLayer) return

    // Calculate actual recorded height (max scroll + viewport height)
    const actualHeight = Math.ceil(maxScrollOffset + canvas.height)

    // Create export canvas with actual recorded height
    const exportCanvas = document.createElement('canvas')
    exportCanvas.width = canvas.width
    exportCanvas.height = actualHeight
    const exportCtx = exportCanvas.getContext('2d')
    if (!exportCtx) return

    // White background
    exportCtx.fillStyle = 'white'
    exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height)

    // Draw the drawing layer (cropped to actual height)
    const croppedLayer = drawingLayer
    const sourceHeight = Math.min(actualHeight, canvasHeight)

    // Create a temporary canvas to extract the exact region we need
    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = canvas.width
    tempCanvas.height = canvasHeight
    const tempCtx = tempCanvas.getContext('2d')
    if (!tempCtx) return

    tempCtx.putImageData(drawingLayer, 0, 0)
    exportCtx.drawImage(tempCanvas, 0, 0, canvas.width, sourceHeight, 0, 0, canvas.width, sourceHeight)

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

  return (
    <div className="app">
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

      <div className="controls">
        <div className="top-left">
          <button
            onClick={isRecording ? stopRecording : startRecording}
            className={isRecording ? 'recording' : ''}
          >
            {isRecording ? 'Stop Recording' : 'Start Recording'}
          </button>
        </div>

        <div className="top-center">
          {isRecording && (
            <div className="pixel-counter">
              {Math.ceil(maxScrollOffset + (canvasRef.current?.height || 0))}px recorded
            </div>
          )}
        </div>

        <div className="top-right">
          <button
            className="settings-fab"
            onClick={() => setShowSettings(!showSettings)}
            disabled={isRecording}
          >
            <img src={settingsIcon} alt="Settings" width="24" height="24" />
          </button>
        </div>

        {isRecording && (
          <div className="bottom-center">
            <button
              className={`full-paint-btn ${isFullPaintMode ? 'active' : ''}`}
              onPointerDown={() => setIsFullPaintMode(true)}
              onPointerUp={() => setIsFullPaintMode(false)}
              onPointerLeave={() => setIsFullPaintMode(false)}
            >
              Full Paint Mode (Hold Space)
            </button>
          </div>
        )}

        {hasRecorded && !isRecording && (
          <div className="bottom-right">
            <button onClick={handleClear}>Clear</button>
            <button onClick={handleExport}>Export</button>
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
