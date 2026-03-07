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
  const [isEraserMode, setIsEraserMode] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [hasStartedRecording, setHasStartedRecording] = useState(false)
  const [targetScrollSpeed, setTargetScrollSpeed] = useState(0)
  const [currentScrollSpeed, setCurrentScrollSpeed] = useState(0)
  const [touchStartY, setTouchStartY] = useState<number | null>(null)
  const [lastTouchY, setLastTouchY] = useState<number | null>(null)

  const animationFrameRef = useRef<number | undefined>(undefined)

  // Drawing canvas - persistent, directly drawn to (no ImageData)
  const drawingCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const isDrawingRef = useRef(false)
  const currentDrawPointRef = useRef<Point | null>(null)
  const lastDrawTimeRef = useRef<number>(0)
  const scrollOffsetRef = useRef<number>(0)
  const currentScrollSpeedRef = useRef<number>(0)
  const isPausedRef = useRef<boolean>(false)
  const hasStartedRecordingRef = useRef<boolean>(false)
  const canvasLengthRef = useRef<number>(5000)

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

  // Sync refs with state
  useEffect(() => {
    isPausedRef.current = isPaused
  }, [isPaused])

  useEffect(() => {
    hasStartedRecordingRef.current = hasStartedRecording
  }, [hasStartedRecording])

  useEffect(() => {
    canvasLengthRef.current = canvasLength
  }, [canvasLength])

  // Native wheel event listener - registered once on mount
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const handleNativeWheel = (e: WheelEvent) => {
      // Use refs for most up-to-date values
      const currentIsPaused = isPausedRef.current
      const currentHasStarted = hasStartedRecordingRef.current
      const currentCanvasLength = canvasLengthRef.current

      // Only allow wheel scrolling when paused or not started
      if (!currentIsPaused && currentHasStarted) {
        return
      }

      e.preventDefault()
      e.stopPropagation()

      const drawingCanvas = drawingCanvasRef.current
      if (!drawingCanvas) return

      // Update scroll offset based on wheel delta
      let newScrollOffset = scrollOffsetRef.current + e.deltaY * 0.5

      // Wrap around
      if (newScrollOffset >= currentCanvasLength) {
        newScrollOffset = newScrollOffset % currentCanvasLength
        setCurrentLoopIndex(idx => idx + 1)
      } else if (newScrollOffset < 0) {
        newScrollOffset = currentCanvasLength + (newScrollOffset % currentCanvasLength)
        setCurrentLoopIndex(idx => Math.max(0, idx - 1))
      }

      scrollOffsetRef.current = newScrollOffset
      setScrollOffset(newScrollOffset)

      renderCanvas(newScrollOffset)
    }

    // Add native event listener with { passive: false } to allow preventDefault
    canvas.addEventListener('wheel', handleNativeWheel, { passive: false })

    return () => {
      canvas.removeEventListener('wheel', handleNativeWheel)
    }
  }, []) // Empty dependency array - register only once on mount

  // Main animation loop (handles both auto-scroll and inertia)
  useEffect(() => {
    if (!hasStartedRecording) return

    const ACCELERATION = 0.15 // More responsive acceleration
    const DECELERATION = 0.12 // More responsive deceleration

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

      // Handle inertia for scroll speed
      let currentSpeed = currentScrollSpeedRef.current
      const targetSpeed = isPaused ? 0 : scrollSpeed

      if (Math.abs(currentSpeed - targetSpeed) > 0.01) {
        if (currentSpeed < targetSpeed) {
          currentSpeed = Math.min(currentSpeed + ACCELERATION, targetSpeed)
        } else if (currentSpeed > targetSpeed) {
          currentSpeed = Math.max(currentSpeed - DECELERATION, targetSpeed)
        }
      } else {
        currentSpeed = targetSpeed
      }

      currentScrollSpeedRef.current = currentSpeed
      setCurrentScrollSpeed(currentSpeed)

      // Use ref for scroll offset to get the latest value (including manual scroll updates)
      let currentScrollOffset = scrollOffsetRef.current

      // Update scroll offset only when scrolling
      if (currentSpeed > 0.001) {
        currentScrollOffset += currentSpeed

        // Check if we've completed a loop
        if (currentScrollOffset >= canvasLength) {
          setCurrentLoopIndex(idx => idx + 1)
          currentScrollOffset = currentScrollOffset - canvasLength
        }

        // Update both React state (for UI display) and ref (for drawing functions)
        setScrollOffset(currentScrollOffset)
        scrollOffsetRef.current = currentScrollOffset
      }

      // Continuous drawing in normal mode (only when not paused and scrolling)
      if (isDrawingRef.current && currentDrawPointRef.current && !isFullPaintActive && currentSpeed > 0.01) {
        const point = currentDrawPointRef.current
        const virtualY = (point.y + currentScrollOffset) % canvasLength // Wrap around for loop recording

        drawingCtx.fillStyle = isEraserMode ? '#ffffff' : '#000000'
        const brushWidth = brushSize
        const brushHeight = brushSize / 8
        drawingCtx.fillRect(
          point.x - brushWidth / 2,
          virtualY - brushHeight / 2,
          brushWidth,
          brushHeight
        )
      }

      // Continuous drawing in Full Paint Mode (only when not paused and scrolling)
      if (isFullPaintActive && fullPaintStartY !== null && currentSpeed > 0.01) {
        const virtualY = (fullPaintStartY + currentScrollOffset) % canvasLength // Wrap around for loop recording

        drawingCtx.fillStyle = '#000000'
        drawingCtx.fillRect(0, virtualY - 2, canvas.width, 4)
      }

      // Render to display canvas (only when scrolling, not when paused and still)
      if (currentSpeed > 0.001 || !isPaused) {
        displayCtx.fillStyle = 'white'
        displayCtx.fillRect(0, 0, canvas.width, canvas.height)

        const availableHeight = canvasLength - currentScrollOffset

        if (availableHeight >= canvas.height) {
          // Simple case: enough space to show full viewport
          displayCtx.drawImage(
            drawingCanvas,
            0, currentScrollOffset,
            canvas.width, canvas.height,
            0, 0,
            canvas.width, canvas.height
          )
        } else {
          // Near end: show what's available from current position
          displayCtx.drawImage(
            drawingCanvas,
            0, currentScrollOffset,
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
      }

      animationFrameRef.current = requestAnimationFrame(animate)
    }

    animationFrameRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [hasStartedRecording, isPaused, scrollSpeed, brushSize, isFullPaintActive, fullPaintStartY, canvasLength, isEraserMode])

  // Keyboard event listener for Shift (Full Paint) and Space (Start/Pause/Resume)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Shift key for Full Paint Mode
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        if (!e.repeat && hasStartedRecording) {
          e.preventDefault()
          setIsFullPaintMode(true)
        }
      }

      // Space key for Start/Pause/Resume Recording
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault()
        if (!hasStartedRecording) {
          startRecording()
        } else if (isPaused) {
          resumeRecording()
        } else {
          pauseRecording()
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
  }, [hasStartedRecording, isPaused])

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
    setIsPaused(false)
    setHasStartedRecording(true)
    setScrollOffset(0)
    setCurrentLoopIndex(0)
  }

  const pauseRecording = () => {
    setIsPaused(true)
  }

  const resumeRecording = () => {
    setIsPaused(false)
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

    ctx.fillStyle = isEraserMode ? '#ffffff' : '#000000'
    const brushWidth = brushSize
    const brushHeight = brushSize / 8
    ctx.fillRect(x - brushWidth / 2, virtualY - brushHeight / 2, brushWidth, brushHeight)

    // Render immediately when paused to show drawing updates
    if (isPaused) {
      renderCanvas(currentScrollOffset)
    }
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

    ctx.fillStyle = isEraserMode ? '#ffffff' : '#000000'
    const brushWidth = brushSize

    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const x = x1 + (x2 - x1) * t
      const y = y1 + (y2 - y1) * t
      const virtualY = (y + currentScrollOffset) % canvasLength // Wrap around for loop recording

      ctx.fillRect(x - brushWidth / 2, virtualY - brushHeight / 2, brushWidth, brushHeight)
    }

    // Render immediately when paused to show drawing updates
    if (isPaused) {
      renderCanvas(currentScrollOffset)
    }
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // Allow drawing even when paused, just need to have started recording
    if (!hasStartedRecording) return

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

    if (!hasStartedRecording) return

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

  const renderCanvas = (newScrollOffset: number) => {
    const canvas = canvasRef.current
    const drawingCanvas = drawingCanvasRef.current
    if (!canvas || !drawingCanvas) {
      return
    }

    const displayCtx = canvas.getContext('2d')
    if (!displayCtx) {
      return
    }

    const currentCanvasLength = canvasLengthRef.current

    displayCtx.fillStyle = 'white'
    displayCtx.fillRect(0, 0, canvas.width, canvas.height)

    const availableHeight = currentCanvasLength - newScrollOffset

    if (availableHeight >= canvas.height) {
      displayCtx.drawImage(
        drawingCanvas,
        0, newScrollOffset,
        canvas.width, canvas.height,
        0, 0,
        canvas.width, canvas.height
      )
    } else {
      displayCtx.drawImage(
        drawingCanvas,
        0, newScrollOffset,
        canvas.width, availableHeight,
        0, 0,
        canvas.width, availableHeight
      )
      const remainingHeight = canvas.height - availableHeight
      displayCtx.drawImage(
        drawingCanvas,
        0, 0,
        canvas.width, remainingHeight,
        0, availableHeight,
        canvas.width, remainingHeight
      )
    }
  }

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    // When paused or not started, allow scrolling
    if (isPaused || !hasStartedRecording) {
      const touch = e.touches[0]
      setTouchStartY(touch.clientY)
      setLastTouchY(touch.clientY)
    }
    // Otherwise, let pointer events handle drawing
  }

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    // When paused or not started, allow scrolling
    if (isPaused || !hasStartedRecording) {
      if (touchStartY === null || lastTouchY === null) return

      e.preventDefault()

      const touch = e.touches[0]
      const deltaY = lastTouchY - touch.clientY
      setLastTouchY(touch.clientY)

      // Update scroll offset based on touch delta
      let newScrollOffset = scrollOffsetRef.current + deltaY

      // Wrap around
      if (newScrollOffset >= canvasLength) {
        newScrollOffset = newScrollOffset % canvasLength
        setCurrentLoopIndex(idx => idx + 1)
      } else if (newScrollOffset < 0) {
        newScrollOffset = canvasLength + (newScrollOffset % canvasLength)
        setCurrentLoopIndex(idx => Math.max(0, idx - 1))
      }

      scrollOffsetRef.current = newScrollOffset
      setScrollOffset(newScrollOffset)

      renderCanvas(newScrollOffset)
    }
    // Otherwise, let pointer events handle drawing
  }

  const handleTouchEnd = () => {
    setTouchStartY(null)
    setLastTouchY(null)
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

    // Render immediately when paused to show drawing updates
    if (isPaused) {
      renderCanvas(currentScrollOffset)
    }
  }

  const handleClear = () => {
    const canvas = canvasRef.current
    const drawingCanvas = drawingCanvasRef.current
    if (!canvas || !drawingCanvas) return

    const drawingCtx = drawingCanvas.getContext('2d')
    if (!drawingCtx) return

    // Clear the drawing canvas
    drawingCtx.fillStyle = 'white'
    drawingCtx.fillRect(0, 0, drawingCanvas.width, drawingCanvas.height)

    // Also update the display canvas immediately
    const displayCtx = canvas.getContext('2d')
    if (displayCtx) {
      displayCtx.fillStyle = 'white'
      displayCtx.fillRect(0, 0, canvas.width, canvas.height)
    }

    setCurrentLoopIndex(0)
    setScrollOffset(0)
    scrollOffsetRef.current = 0
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
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
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
            >
              Settings
            </button>
          </div>

          {/* Top Right: Drawing actions */}
          <div className="top-right">
            <button
              onClick={() => setIsEraserMode(false)}
              disabled={isRecording && !isEraserMode}
              className={!isEraserMode ? 'active-mode' : ''}
            >
              Draw
            </button>
            <button
              onClick={() => setIsEraserMode(true)}
              disabled={isRecording && isEraserMode}
              className={isEraserMode ? 'active-mode' : ''}
            >
              Eraser
            </button>
            <button onClick={handleClear}>Clear</button>
            <button onClick={handleExport}>Export</button>
          </div>
        </div>

        {/* Bottom Center: Recording control with progress */}
        <div className="canvas-bottom-controls">
          <button
            onClick={() => {
              if (!hasStartedRecording) {
                startRecording()
              } else if (isPaused) {
                resumeRecording()
              } else {
                pauseRecording()
              }
            }}
            className={`recording-btn ${isRecording && !isPaused ? 'recording' : ''}`}
          >
            <span className="recording-label">
              {!hasStartedRecording
                ? 'Start Recording (Space)'
                : isPaused
                ? 'Resume Recording (Space)'
                : 'Pause Recording (Space)'}
            </span>
            {hasStartedRecording && (
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
