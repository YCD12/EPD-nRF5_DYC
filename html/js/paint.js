class PaintManager {
  constructor(canvas, ctx) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.painting = false;
    this.lastX = 0;
    this.lastY = 0;
    this.brushColor = "#000000";
    this.brushSize = 2;
    this.currentTool = null;
    this.textElements = [];
    this.lineSegments = [];
    this.isTextPlacementMode = false;
    this.draggingCanvasContext = null;
    this.selectedTextElement = null;
    this.isDraggingText = false;
    this.dragOffsetX = 0;
    this.dragOffsetY = 0;
    this.textBold = false;
    this.textItalic = false;

    // Brush cursor indicator
    this.brushCursor = null;

    // Undo/Redo functionality
    this.historyStack = [];
    this.historyStep = -1;
    this.MAX_HISTORY = 50;

    // Bind event handlers
    this.startPaint = this.startPaint.bind(this);
    this.paint = this.paint.bind(this);
    this.endPaint = this.endPaint.bind(this);
    this.handleCanvasClick = this.handleCanvasClick.bind(this);
    this.onTouchStart = this.onTouchStart.bind(this);
    this.onTouchMove = this.onTouchMove.bind(this);
    this.onTouchEnd = this.onTouchEnd.bind(this);
    this.handleKeyboard = this.handleKeyboard.bind(this);
    this.updateBrushCursor = this.updateBrushCursor.bind(this);
    this.hideBrushCursor = this.hideBrushCursor.bind(this);
  }

  saveToHistory() {
    // Remove any states after current step (when user drew something after undoing)
    this.historyStack = this.historyStack.slice(0, this.historyStep + 1);

    // Save current canvas state along with text and line data
    const canvasState = {
      imageData: this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height),
      textElements: JSON.parse(JSON.stringify(this.textElements)),
      lineSegments: JSON.parse(JSON.stringify(this.lineSegments))
    };

    this.historyStack.push(canvasState);
    this.historyStep++;

    // Limit history size
    if (this.historyStack.length > this.MAX_HISTORY) {
      this.historyStack.shift();
      this.historyStep--;
    }

    this.updateUndoRedoButtons();
  }

  undo() {
    if (this.historyStep > 0) {
      this.historyStep--;
      this.restoreFromHistory();
    }
  }

  redo() {
    if (this.historyStep < this.historyStack.length - 1) {
      this.historyStep++;
      this.restoreFromHistory();
    }
  }

  restoreFromHistory() {
    if (this.historyStep >= 0 && this.historyStep < this.historyStack.length) {
      const state = this.historyStack[this.historyStep];

      // Restore canvas image
      this.ctx.putImageData(state.imageData, 0, 0);

      // Restore text and line data
      this.textElements = JSON.parse(JSON.stringify(state.textElements));
      this.lineSegments = JSON.parse(JSON.stringify(state.lineSegments));

      this.updateUndoRedoButtons();
    }
  }

  updateUndoRedoButtons() {
    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');

    if (undoBtn) {
      undoBtn.disabled = this.historyStep <= 0;
    }

    if (redoBtn) {
      redoBtn.disabled = this.historyStep >= this.historyStack.length - 1;
    }
  }

  initPaintTools() {
    document.getElementById('brush-mode').addEventListener('click', () => {
      if (this.currentTool === 'brush') {
        this.setActiveTool(null, '');
      } else {
        this.setActiveTool('brush', '画笔模式');
        this.brushColor = document.getElementById('brush-color').value;
      }
    });

    document.getElementById('eraser-mode').addEventListener('click', () => {
      if (this.currentTool === 'eraser') {
        this.setActiveTool(null, '');
      } else {
        this.setActiveTool('eraser', '橡皮擦');
        this.brushColor = "#FFFFFF";
      }
    });

    document.getElementById('text-mode').addEventListener('click', () => {
      if (this.currentTool === 'text') {
        this.setActiveTool(null, '');
      } else {
        this.setActiveTool('text', '插入文字');
        this.brushColor = document.getElementById('brush-color').value;
      }
    });

    document.getElementById('brush-color').addEventListener('change', (e) => {
      this.brushColor = e.target.value;
    });

    document.getElementById('brush-size').addEventListener('input', (e) => {
      this.brushSize = parseInt(e.target.value);
      this.updateBrushCursorSize();
    });

    document.getElementById('add-text-btn').addEventListener('click', () => this.startTextPlacement());

    // Add event listeners for bold and italic buttons
    document.getElementById('text-bold').addEventListener('click', () => {
      this.textBold = !this.textBold;
      document.getElementById('text-bold').classList.toggle('primary', this.textBold);
    });

    document.getElementById('text-italic').addEventListener('click', () => {
      this.textItalic = !this.textItalic;
      document.getElementById('text-italic').classList.toggle('primary', this.textItalic);
    });

    // Add undo/redo button listeners
    document.getElementById('undo-btn').addEventListener('click', () => this.undo());
    document.getElementById('redo-btn').addEventListener('click', () => this.redo());

    this.canvas.addEventListener('mousedown', this.startPaint);
    this.canvas.addEventListener('mousemove', this.paint);
    this.canvas.addEventListener('mouseup', this.endPaint);
    this.canvas.addEventListener('mouseleave', this.endPaint);
    this.canvas.addEventListener('click', this.handleCanvasClick);

    // Touch support
    this.canvas.addEventListener('touchstart', this.onTouchStart);
    this.canvas.addEventListener('touchmove', this.onTouchMove);
    this.canvas.addEventListener('touchend', this.onTouchEnd);

    // Keyboard shortcuts for undo/redo
    document.addEventListener('keydown', this.handleKeyboard);

    // Mouse move for brush cursor
    this.canvas.addEventListener('mouseenter', this.updateBrushCursor);
    this.canvas.addEventListener('mousemove', this.updateBrushCursor);

    // Create brush cursor element
    this.createBrushCursor();

    // Initialize history with blank canvas state
    this.saveToHistory();
  }

  handleKeyboard(e) {
    // Ctrl+Z or Cmd+Z for undo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      this.undo();
    }
    // Ctrl+Y or Ctrl+Shift+Z or Cmd+Shift+Z for redo
    else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
      e.preventDefault();
      this.redo();
    }
  }

  setActiveTool(tool, title) {
    setCanvasTitle(title);
    this.currentTool = tool;

    this.canvas.parentNode.classList.toggle('brush-mode', this.currentTool === 'brush');
    this.canvas.parentNode.classList.toggle('eraser-mode', this.currentTool === 'eraser');
    this.canvas.parentNode.classList.toggle('text-mode', this.currentTool === 'text');

    document.getElementById('brush-mode').classList.toggle('active', this.currentTool === 'brush');
    document.getElementById('eraser-mode').classList.toggle('active', this.currentTool === 'eraser');
    document.getElementById('text-mode').classList.toggle('active', this.currentTool === 'text');

    document.getElementById('brush-color').disabled = this.currentTool === 'eraser';
    document.getElementById('brush-size').disabled = this.currentTool === 'text';

    document.getElementById('undo-btn').classList.toggle('hide', this.currentTool === null);
    document.getElementById('redo-btn').classList.toggle('hide', this.currentTool === null);

    // Cancel any pending text placement
    this.cancelTextPlacement();
  }

  createBrushCursor() {
    // Create a div element to show as brush cursor
    this.brushCursor = document.createElement('div');
    this.brushCursor.id = 'brush-cursor';
    this.brushCursor.style.position = 'fixed';
    this.brushCursor.style.border = '2px solid rgba(0, 0, 0, 0.5)';
    this.brushCursor.style.borderRadius = '50%';
    this.brushCursor.style.pointerEvents = 'none';
    this.brushCursor.style.display = 'none';
    this.brushCursor.style.zIndex = '10000';
    this.brushCursor.style.transform = 'translate(-50%, -50%)';
    this.brushCursor.style.willChange = 'transform';
    this.brushCursor.style.left = '0';
    this.brushCursor.style.top = '0';
    document.body.appendChild(this.brushCursor);
    this.updateBrushCursorSize();

    // For requestAnimationFrame throttling
    this.cursorUpdateScheduled = false;
    this.pendingCursorX = 0;
    this.pendingCursorY = 0;
  }

  updateBrushCursorSize() {
    if (!this.brushCursor) return;

    const rect = this.canvas.getBoundingClientRect();
    const scaleX = rect.width / this.canvas.width;
    const scaleY = rect.height / this.canvas.height;
    const scale = Math.min(scaleX, scaleY);

    const size = this.brushSize * scale;
    this.brushCursor.style.width = size + 'px';
    this.brushCursor.style.height = size + 'px';
  }

  updateBrushCursor(e) {
    if (!this.brushCursor) return;

    if (this.currentTool === 'brush' || this.currentTool === 'eraser') {
      // Check if mouse is within canvas bounds
      const rect = this.canvas.getBoundingClientRect();
      const isInCanvas = e.clientX >= rect.left && 
                         e.clientX <= rect.right && 
                         e.clientY >= rect.top && 
                         e.clientY <= rect.bottom;

      if (isInCanvas) {
        this.brushCursor.style.display = 'block';
        this.canvas.style.cursor = 'none';

        // Store the pending position
        this.pendingCursorX = e.clientX;
        this.pendingCursorY = e.clientY;

        // Schedule update using requestAnimationFrame for smooth movement
        if (!this.cursorUpdateScheduled) {
          this.cursorUpdateScheduled = true;
          requestAnimationFrame(() => {
            this.brushCursor.style.transform = `translate(${this.pendingCursorX}px, ${this.pendingCursorY}px) translate(-50%, -50%)`;
            this.cursorUpdateScheduled = false;
          });
        }

        // Update color to match brush or show white for eraser (only needs to happen once or when tool changes)
        if (this.currentTool === 'eraser') {
          if (this.brushCursor.getAttribute('data-tool') !== 'eraser') {
            this.brushCursor.style.border = '2px solid rgba(255, 0, 0, 0.7)';
            this.brushCursor.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
            this.brushCursor.style.boxShadow = 'none';
            this.brushCursor.setAttribute('data-tool', 'eraser');
          }
        } else {
          if (this.brushCursor.getAttribute('data-tool') !== 'brush') {
            // Use a contrasting border - white with black outline for visibility
            this.brushCursor.style.border = '1px solid white';
            this.brushCursor.style.boxShadow = '0 0 0 1px black, inset 0 0 0 1px black';
            this.brushCursor.style.backgroundColor = 'transparent';
            this.brushCursor.setAttribute('data-tool', 'brush');
          }
        }
      } else {
        // Hide cursor when outside canvas
        this.brushCursor.style.display = 'none';
      }
    }
  }

  hideBrushCursor() {
    if (this.brushCursor) {
      this.brushCursor.style.display = 'none';
    }
    this.canvas.style.cursor = 'default';
  }

  startPaint(e) {
    if (!this.currentTool) return;

    if (this.currentTool === 'text') {
      // Check if we're clicking on a text element to drag
      const textElement = this.findTextElementAt(e);
      if (textElement && textElement === this.selectedTextElement) {
        this.isDraggingText = true;

        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        // Calculate offset for smooth dragging
        this.dragOffsetX = textElement.x - x;
        this.dragOffsetY = textElement.y - y;

        return; // Don't start drawing
      }
    } else {
      this.painting = true;
      this.draw(e);
    }
  }

  endPaint() {
    if (this.painting || this.isDraggingText) {
      this.saveToHistory(); // Save state after drawing or dragging text
    }
    this.painting = false;
    this.isDraggingText = false;
    this.lastX = 0;
    this.lastY = 0;

    this.hideBrushCursor();
  }

  paint(e) {
    if (!this.currentTool) return;

    if (this.currentTool === 'text') {
      if (this.isDraggingText && this.selectedTextElement) {
        this.dragText(e);
      }
    } else {
      if (this.painting) {
        this.draw(e);
      }
    }
  }

  draw(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    this.ctx.lineJoin = 'round';
    this.ctx.lineCap = 'round';
    this.ctx.strokeStyle = this.brushColor;
    this.ctx.lineWidth = this.brushSize;

    this.ctx.beginPath();

    if (this.lastX === 0 && this.lastY === 0) {
      // For the first point, just do a dot
      this.ctx.moveTo(x, y);
      this.ctx.lineTo(x + 0.1, y + 0.1);

      // Store the dot for redrawing
      this.lineSegments.push({
        type: 'dot',
        x: x,
        y: y,
        color: this.brushColor,
        size: this.brushSize
      });
    } else {
      // Connect to the previous point
      this.ctx.moveTo(this.lastX, this.lastY);
      this.ctx.lineTo(x, y);

      // Store the line segment for redrawing
      this.lineSegments.push({
        type: 'line',
        x1: this.lastX,
        y1: this.lastY,
        x2: x,
        y2: y,
        color: this.brushColor,
        size: this.brushSize
      });
    }

    this.ctx.stroke();

    this.lastX = x;
    this.lastY = y;
  }

  handleCanvasClick(e) {
    if (this.currentTool === 'text' && this.isTextPlacementMode) {
      this.placeText(e);
    }
  }

  onTouchStart(e) {
    e.preventDefault();
    const touch = e.touches[0];

    // If in text placement mode, handle as a click
    if (this.currentTool === 'text' && this.isTextPlacementMode) {
      const mouseEvent = new MouseEvent('click', {
        clientX: touch.clientX,
        clientY: touch.clientY
      });
      this.canvas.dispatchEvent(mouseEvent);
      return;
    }

    // Otherwise handle as normal drawing
    const mouseEvent = new MouseEvent('mousedown', {
      clientX: touch.clientX,
      clientY: touch.clientY
    });
    this.canvas.dispatchEvent(mouseEvent);
  }

  onTouchMove(e) {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousemove', {
      clientX: touch.clientX,
      clientY: touch.clientY
    });
    this.canvas.dispatchEvent(mouseEvent);
  }

  onTouchEnd(e) {
    e.preventDefault();
    this.endPaint();
  }

  dragText(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // Update text position with offset
    this.selectedTextElement.x = x + this.dragOffsetX;
    this.selectedTextElement.y = y + this.dragOffsetY;

    // Redraw selected text element
    if (this.draggingCanvasContext) {
      this.ctx.putImageData(this.draggingCanvasContext, 0, 0);
    } else {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    this.ctx.font = this.selectedTextElement.font;
    this.ctx.fillStyle = this.selectedTextElement.color;
    this.ctx.fillText(this.selectedTextElement.text, this.selectedTextElement.x, this.selectedTextElement.y);
  }

  findTextElementAt(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // Search through text elements in reverse order (top-most first)
    for (let i = this.textElements.length - 1; i >= 0; i--) {
      const text = this.textElements[i];

      // Calculate text dimensions
      this.ctx.font = text.font;
      const textWidth = this.ctx.measureText(text.text).width;

      // Extract font size correctly from the font string
      const fontSizeMatch = text.font.match(/(\d+)px/);
      const fontSize = fontSizeMatch ? parseInt(fontSizeMatch[1]) : 14;
      const textHeight = fontSize * 1.2; // Approximate height

      // Check if click is within text bounds (allowing for some margin)
      const margin = 5;
      if (x >= text.x - margin &&
        x <= text.x + textWidth + margin &&
        y >= text.y - textHeight + margin &&
        y <= text.y + margin) {
        return text;
      }
    }

    return null;
  }

  startTextPlacement() {
    const text = document.getElementById('text-input').value.trim();
    if (!text) {
      alert('请输入文字内容');
      return;
    }

    this.isTextPlacementMode = true;

    // Add visual feedback
    setCanvasTitle('点击画布放置文字');
    this.canvas.classList.add('text-placement-mode');
  }

  cancelTextPlacement() {
    this.isTextPlacementMode = false;
    this.canvas.classList.remove('text-placement-mode');

    // reset dragging state
    this.isDraggingText = false;
    this.dragOffsetX = 0;
    this.dragOffsetY = 0;
    this.selectedTextElement = null;
    this.draggingCanvasContext = null;
  }

  placeText(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const text = document.getElementById('text-input').value;
    const fontFamily = document.getElementById('font-family').value;
    const fontSize = document.getElementById('font-size').value;

    // Build font style string
    let fontStyle = '';
    if (this.textItalic) fontStyle += 'italic ';
    if (this.textBold) fontStyle += 'bold ';

    // Create a new text element
    const newText = {
      text: text,
      x: x,
      y: y,
      font: `${fontStyle}${fontSize}px ${fontFamily}`,
      color: this.brushColor
    };

    // Add to our list of text elements
    this.textElements.push(newText);

    // Select this text element for immediate dragging
    this.selectedTextElement = newText;
    this.draggingCanvasContext = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);

    // Draw text on canvas
    this.ctx.font = newText.font;
    this.ctx.fillStyle = newText.color;
    this.ctx.fillText(newText.text, newText.x, newText.y);

    // Save to history after placing text
    this.saveToHistory();

    // Reset
    document.getElementById('text-input').value = '';
    this.isTextPlacementMode = false;
    this.canvas.classList.remove('text-placement-mode');
    setCanvasTitle('拖动新添加文字可调整位置');
  }

  redrawTextElements() {
    // Redraw all text elements after dithering
    this.textElements.forEach(item => {
      this.ctx.font = item.font;
      this.ctx.fillStyle = item.color;
      this.ctx.fillText(item.text, item.x, item.y);
    });
  }

  redrawLineSegments() {
    // Redraw all line segments after dithering
    this.lineSegments.forEach(segment => {
      this.ctx.lineJoin = 'round';
      this.ctx.lineCap = 'round';
      this.ctx.strokeStyle = segment.color;
      this.ctx.lineWidth = segment.size;
      this.ctx.beginPath();

      if (segment.type === 'dot') {
        this.ctx.moveTo(segment.x, segment.y);
        this.ctx.lineTo(segment.x + 0.1, segment.y + 0.1);
      } else {
        this.ctx.moveTo(segment.x1, segment.y1);
        this.ctx.lineTo(segment.x2, segment.y2);
      }

      this.ctx.stroke();
    });
  }

  clearElements() {
    this.textElements = [];
    this.lineSegments = [];
  }
}
