let painting = false;
let lastX = 0;
let lastY = 0;
let brushColor = "#000000";
let brushSize = 2;
let currentTool = null; // Start with no tool selected
let textElements = []; // Store text elements for re-rendering after dithering
let lineSegments = []; // Store line segments for re-rendering after dithering
let isTextPlacementMode = false;
let draggingCanvasContext = null; // Backup of the canvas for dragging
let selectedTextElement = null; // Track the currently selected text for dragging
let isDraggingText = false; // Track if we're currently dragging text
let dragOffsetX = 0; // Offset from mouse to text position when dragging
let dragOffsetY = 0;
let textBold = false; // Track if text should be bold
let textItalic = false; // Track if text should be italic

// Undo/Redo functionality
let historyStack = []; // Stack to store canvas history
let historyStep = -1; // Current position in history stack
const MAX_HISTORY = 50; // Maximum number of undo steps

function setCanvasTitle(title) {
  const canvasTitle = document.querySelector('.canvas-title');
  if (canvasTitle) {
    canvasTitle.innerText = title;
    canvasTitle.style.display = title && title !== '' ? 'block' : 'none';
  }
}

function saveToHistory() {
  // Remove any states after current step (when user drew something after undoing)
  historyStack = historyStack.slice(0, historyStep + 1);
  
  // Save current canvas state along with text and line data
  const canvasState = {
    imageData: ctx.getImageData(0, 0, canvas.width, canvas.height),
    textElements: JSON.parse(JSON.stringify(textElements)),
    lineSegments: JSON.parse(JSON.stringify(lineSegments))
  };
  
  historyStack.push(canvasState);
  historyStep++;
  
  // Limit history size
  if (historyStack.length > MAX_HISTORY) {
    historyStack.shift();
    historyStep--;
  }
  
  updateUndoRedoButtons();
}

function undo() {
  if (historyStep > 0) {
    historyStep--;
    restoreFromHistory();
  }
}

function redo() {
  if (historyStep < historyStack.length - 1) {
    historyStep++;
    restoreFromHistory();
  }
}

function restoreFromHistory() {
  if (historyStep >= 0 && historyStep < historyStack.length) {
    const state = historyStack[historyStep];
    
    // Restore canvas image
    ctx.putImageData(state.imageData, 0, 0);
    
    // Restore text and line data
    textElements = JSON.parse(JSON.stringify(state.textElements));
    lineSegments = JSON.parse(JSON.stringify(state.lineSegments));
    
    updateUndoRedoButtons();
  }
}

function updateUndoRedoButtons() {
  const undoBtn = document.getElementById('undo-btn');
  const redoBtn = document.getElementById('redo-btn');
  
  if (undoBtn) {
    undoBtn.disabled = historyStep <= 0;
  }
  
  if (redoBtn) {
    redoBtn.disabled = historyStep >= historyStack.length - 1;
  }
}

function initPaintTools() {
  document.getElementById('brush-mode').addEventListener('click', () => {
    if (currentTool === 'brush') {
      setActiveTool(null, '');
    } else {
      setActiveTool('brush', '画笔模式');
      brushColor = document.getElementById('brush-color').value;
    }
  });
  
  document.getElementById('eraser-mode').addEventListener('click', () => {
    if (currentTool === 'eraser') {
      setActiveTool(null, '');
    } else {
      setActiveTool('eraser', '橡皮擦');
      brushColor = "#FFFFFF";
    }
  });

  document.getElementById('text-mode').addEventListener('click', () => {
    if (currentTool === 'text') {
      setActiveTool(null, '');
    } else {
      setActiveTool('text', '插入文字');
      brushColor = document.getElementById('brush-color').value;
    }
  });
  
  document.getElementById('brush-color').addEventListener('change', (e) => {
    brushColor = e.target.value;
  });
  
  document.getElementById('brush-size').addEventListener('change', (e) => {
    brushSize = parseInt(e.target.value);
  });

  document.getElementById('add-text-btn').addEventListener('click', startTextPlacement);

  // Add event listeners for bold and italic buttons
  document.getElementById('text-bold').addEventListener('click', () => {
    textBold = !textBold;
    document.getElementById('text-bold').classList.toggle('primary', textBold);
  });
  
  document.getElementById('text-italic').addEventListener('click', () => {
    textItalic = !textItalic;
    document.getElementById('text-italic').classList.toggle('primary', textItalic);
  });

  // Add undo/redo button listeners
  document.getElementById('undo-btn').addEventListener('click', undo);
  document.getElementById('redo-btn').addEventListener('click', redo);
  
  canvas.addEventListener('mousedown', startPaint);
  canvas.addEventListener('mousemove', paint);
  canvas.addEventListener('mouseup', endPaint);
  canvas.addEventListener('mouseleave', endPaint);
  canvas.addEventListener('click', handleCanvasClick);
  
  // Touch support
  canvas.addEventListener('touchstart', onTouchStart);
  canvas.addEventListener('touchmove', onTouchMove);
  canvas.addEventListener('touchend', onTouchEnd);
  
  // Keyboard shortcuts for undo/redo
  document.addEventListener('keydown', (e) => {
    // Ctrl+Z or Cmd+Z for undo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    }
    // Ctrl+Y or Ctrl+Shift+Z or Cmd+Shift+Z for redo
    else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
      e.preventDefault();
      redo();
    }
  });
  
  // Initialize history with blank canvas state
  saveToHistory();
}

function setActiveTool(tool, title) {
  setCanvasTitle(title);
  currentTool = tool;

  canvas.parentNode.classList.toggle('brush-mode', currentTool === 'brush');
  canvas.parentNode.classList.toggle('eraser-mode', currentTool === 'eraser');
  canvas.parentNode.classList.toggle('text-mode', currentTool === 'text');

  document.getElementById('brush-mode').classList.toggle('active', currentTool === 'brush');
  document.getElementById('eraser-mode').classList.toggle('active', currentTool === 'eraser');
  document.getElementById('text-mode').classList.toggle('active', currentTool === 'text');

  document.getElementById('brush-color').disabled = currentTool === 'eraser';
  document.getElementById('brush-size').disabled = currentTool === 'text';

  document.getElementById('undo-btn').classList.toggle('hide', currentTool === null);
  document.getElementById('redo-btn').classList.toggle('hide', currentTool === null);

  // Cancel any pending text placement
  cancelTextPlacement();
}

function startPaint(e) {
  if (!currentTool) return;

  if (currentTool === 'text') {
    // Check if we're clicking on a text element to drag
    const textElement = findTextElementAt(e);
    if (textElement && textElement === selectedTextElement) {
      isDraggingText = true;
      
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;
      
      // Calculate offset for smooth dragging
      dragOffsetX = textElement.x - x;
      dragOffsetY = textElement.y - y;
      
      return; // Don't start drawing
    }
  } else {
    painting = true;
    draw(e);
  }
}

function endPaint() {
  if (painting || isDraggingText) {
    saveToHistory(); // Save state after drawing or dragging text
  }
  painting = false;
  isDraggingText = false;
  lastX = 0;
  lastY = 0;
}

function paint(e) {
  if (!currentTool) return;

  if (currentTool === 'text') {
    if (isDraggingText && selectedTextElement) {
      dragText(e);
    }
  } else {
    if (painting) {
      draw(e);
    }
  }
}

function draw(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;
  
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = brushColor;
  ctx.lineWidth = brushSize;
  
  ctx.beginPath();
  
  if (lastX === 0 && lastY === 0) {
    // For the first point, just do a dot
    ctx.moveTo(x, y);
    ctx.lineTo(x+0.1, y+0.1);
    
    // Store the dot for redrawing
    lineSegments.push({
      type: 'dot',
      x: x,
      y: y,
      color: brushColor,
      size: brushSize
    });
  } else {
    // Connect to the previous point
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(x, y);
    
    // Store the line segment for redrawing
    lineSegments.push({
      type: 'line',
      x1: lastX,
      y1: lastY,
      x2: x,
      y2: y,
      color: brushColor,
      size: brushSize
    });
  }
  
  ctx.stroke();
  
  lastX = x;
  lastY = y;
}

function handleCanvasClick(e) {
  if (currentTool === 'text' && isTextPlacementMode) {
    placeText(e);
  }
}

// Improve touch handling for text placement
function onTouchStart(e) {
    e.preventDefault();
    const touch = e.touches[0];
    
    // If in text placement mode, handle as a click
    if (currentTool === 'text' && isTextPlacementMode) {
        const mouseEvent = new MouseEvent('click', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        canvas.dispatchEvent(mouseEvent);
        return;
    }
    
    // Otherwise handle as normal drawing
    const mouseEvent = new MouseEvent('mousedown', {
        clientX: touch.clientX,
        clientY: touch.clientY
    });
    canvas.dispatchEvent(mouseEvent);
}

function onTouchMove(e) {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousemove', {
        clientX: touch.clientX,
        clientY: touch.clientY
    });
    canvas.dispatchEvent(mouseEvent);
}

function onTouchEnd(e) {
    e.preventDefault();
    endPaint();
}

function dragText(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;
  
  // Update text position with offset
  selectedTextElement.x = x + dragOffsetX;
  selectedTextElement.y = y + dragOffsetY;
  
  // Redraw selected text element
  if (draggingCanvasContext) {
    ctx.putImageData(draggingCanvasContext, 0, 0);
  } else {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  ctx.font = selectedTextElement.font;
  ctx.fillStyle = selectedTextElement.color;
  ctx.fillText(selectedTextElement.text, selectedTextElement.x, selectedTextElement.y);
}

function findTextElementAt(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;
  
  // Search through text elements in reverse order (top-most first)
  for (let i = textElements.length - 1; i >= 0; i--) {
    const text = textElements[i];
    
    // Calculate text dimensions
    ctx.font = text.font;
    const textWidth = ctx.measureText(text.text).width;

    // Extract font size correctly from the font string
    // This handles "bold 14px Arial", "italic 14px Arial", "bold italic 14px Arial", etc.
    const fontSizeMatch = text.font.match(/(\d+)px/);
    const fontSize = fontSizeMatch ? parseInt(fontSizeMatch[1]) : 14; // Default to 14 if not found
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

function startTextPlacement() {
  const text = document.getElementById('text-input').value.trim();
  if (!text) {
      alert('请输入文字内容');
      return;
  }

  isTextPlacementMode = true;

  // Add visual feedback
  setCanvasTitle('点击画布放置文字');
  canvas.classList.add('text-placement-mode');
}

function cancelTextPlacement() {
  isTextPlacementMode = false;
  canvas.classList.remove('text-placement-mode'); 

  // reset dragging state
  isDraggingText = false;
  dragOffsetX = 0;
  dragOffsetY = 0;
  selectedTextElement = null;
  draggingCanvasContext = null;
}

function placeText(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;

  const text = document.getElementById('text-input').value;
  const fontFamily = document.getElementById('font-family').value;
  const fontSize = document.getElementById('font-size').value;

  // Build font style string
  let fontStyle = '';
  if (textItalic) fontStyle += 'italic ';
  if (textBold) fontStyle += 'bold ';
  
  // Create a new text element
  const newText = {
    text: text,
    x: x,
    y: y,
    font: `${fontStyle}${fontSize}px ${fontFamily}`,
    color: brushColor
  };
  
  // Add to our list of text elements
  textElements.push(newText);
  
  // Select this text element for immediate dragging
  selectedTextElement = newText;
  draggingCanvasContext = ctx.getImageData(0, 0, canvas.width, canvas.height);
  
  // Draw text on canvas
  ctx.font = newText.font;
  ctx.fillStyle = newText.color;
  ctx.fillText(newText.text, newText.x, newText.y);
  
  // Save to history after placing text
  saveToHistory();
  
  // Reset
  document.getElementById('text-input').value = '';
  isTextPlacementMode = false;
  canvas.classList.remove('text-placement-mode');
  setCanvasTitle('拖动新添加文字可调整位置');
}

function redrawTextElements() {
  // Redraw all text elements after dithering
  textElements.forEach(item => {
    ctx.font = item.font;
    ctx.fillStyle = item.color;
    ctx.fillText(item.text, item.x, item.y);
  });
}

function redrawLineSegments() {
  // Redraw all line segments after dithering
  lineSegments.forEach(segment => {
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = segment.color;
    ctx.lineWidth = segment.size;
    ctx.beginPath();
    
    if (segment.type === 'dot') {
      ctx.moveTo(segment.x, segment.y);
      ctx.lineTo(segment.x+0.1, segment.y+0.1);
    } else {
      ctx.moveTo(segment.x1, segment.y1);
      ctx.lineTo(segment.x2, segment.y2);
    }
    
    ctx.stroke();
  });
}
