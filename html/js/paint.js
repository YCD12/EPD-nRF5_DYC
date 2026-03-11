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
    this.selectedEditingText = null; // For re-editing existing text elements
    this.todoItems = [];
    this.isTodoPlacementMode = false;
    this.selectedTodoItem = null;
    this.todoBold = false;
    this.todoItalic = false;
    this.todoColor = '#000000';
    this.showTodoDeleteButtons = true; // Toggle for showing/hiding delete buttons

    // Schedule (timetable) properties
    this.scheduleData = null; // 2D array to store schedule data
    this.scheduleDays = 5;
    this.scheduleClasses = 6;
    this.scheduleFontFamily = 'SimHei';
    this.scheduleFontSize = 12;
    this.scheduleColor = '#000000';
    this.scheduleStartX = 20;
    this.scheduleStartY = 20;
    this.scheduleCellWidth = 60;
    this.scheduleCellHeight = 35;
    this.weekDays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    this.selectedScheduleCell = null; // For editing schedule cells
    this.showScheduleCellIndicator = true; // Toggle for showing/hiding cell selection indicator
    this.scheduleCellFontSizes = null; // 2D array for per-cell font sizes

    // Brush cursor indicator
    this.brushCursor = null;

    // Undo/Redo functionality
    this.historyStack = [];
    this.historyStep = -1;
    this.MAX_HISTORY = 25; // 降低历史记录上限，防止手机端内存溢出 (50 -> 25)

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
      lineSegments: JSON.parse(JSON.stringify(this.lineSegments)),
      todoItems: JSON.parse(JSON.stringify(this.todoItems)),
      scheduleData: this.scheduleData ? JSON.parse(JSON.stringify(this.scheduleData)) : null
    };

    this.historyStack.push(canvasState);
    this.historyStep++;

    // Limit history size
    if (this.historyStack.length > this.MAX_HISTORY) {
      this.historyStack.shift();
      this.historyStep--;
    }

    this.updateUndoRedoButtons();

    // Auto-save to localStorage
    this.saveCanvasToLocalStorage();
  }

  saveCanvasToLocalStorage() {
    try {
      // 使用压缩的数据格式避免超出配额
      const canvasData = {
        // 使用canvas.toDataURL代替原始imageData，更节省空间
        imageDataUrl: this.canvas.toDataURL('image/png', 0.8),
        textElements: this.textElements,
        lineSegments: this.lineSegments.slice(-100), // 只保留最近100个线段
        todoItems: this.todoItems,
        scheduleData: this.scheduleData,
        width: this.canvas.width,
        height: this.canvas.height
      };
      localStorage.setItem('canvasState', JSON.stringify(canvasData));
    } catch (e) {
      if (e.name === 'QuotaExceededError') {
        // 空间不足时，清理旧数据后重试
        console.warn('localStorage quota exceeded, clearing old data...');
        try {
          localStorage.removeItem('canvasState');
          // 简化存储，只保存必要元素
          const minimalData = {
            textElements: this.textElements,
            todoItems: this.todoItems,
            scheduleData: this.scheduleData,
            width: this.canvas.width,
            height: this.canvas.height
          };
          localStorage.setItem('canvasState', JSON.stringify(minimalData));
        } catch (e2) {
          console.error('Failed to save minimal canvas data:', e2);
        }
      } else {
        console.error('Failed to save canvas to localStorage:', e);
      }
    }
  }

  loadCanvasFromLocalStorage() {
    try {
      const savedData = localStorage.getItem('canvasState');
      if (!savedData) return false;

      const canvasData = JSON.parse(savedData);

      // Verify dimensions match
      if (canvasData.width !== this.canvas.width || canvasData.height !== this.canvas.height) {
        return false;
      }

      // Restore image data - support both new and old format
      if (canvasData.imageDataUrl) {
        // 新格式：使用DataURL
        return new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            this.ctx.drawImage(img, 0, 0);
            // Restore elements
            this.textElements = canvasData.textElements || [];
            this.lineSegments = canvasData.lineSegments || [];
            this.todoItems = canvasData.todoItems || [];
            this.scheduleData = canvasData.scheduleData || null;
            this.saveToHistory();
            resolve(true);
          };
          img.onerror = () => resolve(false);
          img.src = canvasData.imageDataUrl;
        });
      } else if (canvasData.imageData) {
        // 旧格式：使用原始像素数据
        const imageArray = canvasData.imageData.split(',').map(Number);
        const imageData = this.ctx.createImageData(this.canvas.width, this.canvas.height);
        imageData.data.set(imageArray);
        this.ctx.putImageData(imageData, 0, 0);
      }
      // 简化格式：无图像数据

      // Restore elements
      this.textElements = canvasData.textElements || [];
      this.lineSegments = canvasData.lineSegments || [];
      this.todoItems = canvasData.todoItems || [];
      this.scheduleData = canvasData.scheduleData || null;

      this.saveToHistory();
      return true;
    } catch (e) {
      console.error('Failed to load canvas from localStorage:', e);
      return false;
    }
  }

  clearCanvasCache() {
    try {
      localStorage.removeItem('canvasState');
    } catch (e) {
      console.error('Failed to clear canvas cache:', e);
    }
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
      this.todoItems = JSON.parse(JSON.stringify(state.todoItems || []));
      this.scheduleData = state.scheduleData ? JSON.parse(JSON.stringify(state.scheduleData)) : null;

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
    document.getElementById('brush-mode').addEventListener('click', async () => {
      if (this.currentTool === 'brush') {
        this.setActiveTool(null, '');
      } else {
        await this.loadCanvasFromLocalStorage();
        this.scheduleData = null; // 切回普通模式时清除课表
        this.setActiveTool('brush', '画笔模式');
        this.brushColor = document.getElementById('brush-color').value;
        this.redrawAll();
      }
    });

    document.getElementById('eraser-mode').addEventListener('click', async () => {
      if (this.currentTool === 'eraser') {
        this.setActiveTool(null, '');
      } else {
        await this.loadCanvasFromLocalStorage();
        this.scheduleData = null; // 切回普通模式时清除课表
        this.setActiveTool('eraser', '橡皮擦');
        this.brushColor = "#FFFFFF";
        this.redrawAll();
      }
    });

    document.getElementById('text-mode').addEventListener('click', async () => {
      if (this.currentTool === 'text') {
        this.setActiveTool(null, '');
      } else {
        await this.loadCanvasFromLocalStorage();
        this.scheduleData = null; // 切回普通模式时清除课表
        this.setActiveTool('text', '插入文字');
        this.brushColor = document.getElementById('brush-color').value;
        this.redrawAll();
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

    document.getElementById('todo-mode').addEventListener('click', async () => {
      if (this.currentTool === 'todo') {
        this.setActiveTool(null, '');
      } else {
        // Load cached canvas data if available
        await this.loadCanvasFromLocalStorage();
        this.scheduleData = null; // 切回待办模式时清除课表
        this.setActiveTool('todo', '添加待办项');
        this.brushColor = document.getElementById('brush-color').value;
        this.redrawAll();
      }
    });

    document.getElementById('add-todo-btn').addEventListener('click', () => this.startTodoPlacement());

    document.getElementById('schedule-mode').addEventListener('click', async () => {
      if (this.currentTool === 'schedule') {
        this.setActiveTool(null, '');
      } else {
        // Load cached schedule data if available
        await this.loadScheduleFromLocalStorage();
        this.setActiveTool('schedule', '生成课表');
      }
    });

    document.getElementById('create-schedule-btn').addEventListener('click', () => this.createSchedule());

    document.getElementById('toggle-schedule-cell-indicator-btn').addEventListener('click', () => {
      this.showScheduleCellIndicator = !this.showScheduleCellIndicator;
      document.getElementById('toggle-schedule-cell-indicator-btn').classList.toggle('primary', this.showScheduleCellIndicator);
      if (this.scheduleData) {
        this.redrawAll();
      }
    });

    document.getElementById('schedule-input-confirm-btn').addEventListener('click', () => this.confirmScheduleInput());
    document.getElementById('schedule-input-cancel-btn').addEventListener('click', () => this.cancelScheduleInput());

    // Schedule font size adjustment buttons (context-aware: per-cell when selected, global otherwise)
    document.getElementById('schedule-font-increase-btn').addEventListener('click', () => {
      if (this.selectedScheduleCell && this.scheduleCellFontSizes) {
        const { row, col } = this.selectedScheduleCell;
        this.scheduleCellFontSizes[row][col] = Math.min(this.scheduleCellFontSizes[row][col] + 1, 32);
        document.getElementById('schedule-font-size').value = this.scheduleCellFontSizes[row][col];
        this.redrawAll();
        this.saveScheduleToLocalStorage();
      } else {
        this.scheduleFontSize = Math.min(this.scheduleFontSize + 1, 32);
        document.getElementById('schedule-font-size').value = this.scheduleFontSize;
        if (this.scheduleData) {
          this.calculateScheduleDimensions();
          this.redrawAll();
        }
      }
    });

    document.getElementById('schedule-font-decrease-btn').addEventListener('click', () => {
      if (this.selectedScheduleCell && this.scheduleCellFontSizes) {
        const { row, col } = this.selectedScheduleCell;
        this.scheduleCellFontSizes[row][col] = Math.max(this.scheduleCellFontSizes[row][col] - 1, 6);
        document.getElementById('schedule-font-size').value = this.scheduleCellFontSizes[row][col];
        this.redrawAll();
        this.saveScheduleToLocalStorage();
      } else {
        this.scheduleFontSize = Math.max(this.scheduleFontSize - 1, 8);
        document.getElementById('schedule-font-size').value = this.scheduleFontSize;
        if (this.scheduleData) {
          this.calculateScheduleDimensions();
          this.redrawAll();
        }
      }
    });

    // Schedule font size input change
    document.getElementById('schedule-font-size').addEventListener('change', (e) => {
      const val = parseInt(e.target.value);
      if (this.selectedScheduleCell && this.scheduleCellFontSizes) {
        const { row, col } = this.selectedScheduleCell;
        this.scheduleCellFontSizes[row][col] = Math.max(6, Math.min(32, val));
        this.redrawAll();
        this.saveScheduleToLocalStorage();
      } else {
        this.scheduleFontSize = val;
        if (this.scheduleData) {
          this.calculateScheduleDimensions();
          this.redrawAll();
        }
      }
    });

    // Schedule move buttons
    document.getElementById('schedule-move-up-btn').addEventListener('click', () => {
      this.scheduleStartY = Math.max(this.scheduleStartY - 10, 5);
      if (this.scheduleData) this.redrawAll();
    });

    document.getElementById('schedule-move-down-btn').addEventListener('click', () => {
      const maxY = this.canvas.height - (this.scheduleClasses + 1) * this.scheduleCellHeight - 5;
      this.scheduleStartY = Math.min(this.scheduleStartY + 10, maxY);
      if (this.scheduleData) this.redrawAll();
    });

    document.getElementById('schedule-move-left-btn').addEventListener('click', () => {
      this.scheduleStartX = Math.max(this.scheduleStartX - 10, 5);
      if (this.scheduleData) this.redrawAll();
    });

    document.getElementById('schedule-move-right-btn').addEventListener('click', () => {
      const maxX = this.canvas.width - (this.scheduleDays + 1) * this.scheduleCellWidth - 5;
      this.scheduleStartX = Math.min(this.scheduleStartX + 10, maxX);
      if (this.scheduleData) this.redrawAll();
    });

    // Schedule zoom buttons
    document.getElementById('schedule-zoom-in-btn').addEventListener('click', () => {
      this.scheduleCellWidth = Math.min(this.scheduleCellWidth + 5, 200);
      this.scheduleCellHeight = Math.min(this.scheduleCellHeight + 5, 100);
      if (this.scheduleData) this.redrawAll();
    });

    document.getElementById('schedule-zoom-out-btn').addEventListener('click', () => {
      this.scheduleCellWidth = Math.max(this.scheduleCellWidth - 5, 30);
      this.scheduleCellHeight = Math.max(this.scheduleCellHeight - 5, 20);
      if (this.scheduleData) this.redrawAll();
    });

    // Add event listeners for bold and italic buttons
    document.getElementById('text-bold').addEventListener('click', () => {
      this.textBold = !this.textBold;
      document.getElementById('text-bold').classList.toggle('primary', this.textBold);
    });

    document.getElementById('text-italic').addEventListener('click', () => {
      this.textItalic = !this.textItalic;
      document.getElementById('text-italic').classList.toggle('primary', this.textItalic);
    });

    // Add event listeners for todo bold and italic buttons
    document.getElementById('todo-bold').addEventListener('click', () => {
      this.todoBold = !this.todoBold;
      document.getElementById('todo-bold').classList.toggle('primary', this.todoBold);
    });

    document.getElementById('todo-italic').addEventListener('click', () => {
      this.todoItalic = !this.todoItalic;
      document.getElementById('todo-italic').classList.toggle('primary', this.todoItalic);
    });

    document.getElementById('todo-color').addEventListener('change', (e) => {
      this.todoColor = e.target.value;
    });

    document.getElementById('toggle-todo-delete-btn').addEventListener('click', () => {
      this.showTodoDeleteButtons = !this.showTodoDeleteButtons;
      document.getElementById('toggle-todo-delete-btn').classList.toggle('primary', this.showTodoDeleteButtons);
      // Redraw all todo items with the new visibility state
      this.redrawAll();
    });

    // Add undo/redo button listeners
    document.getElementById('undo-btn').addEventListener('click', () => this.undo());
    document.getElementById('redo-btn').addEventListener('click', () => this.redo());

    this.canvas.addEventListener('mousedown', this.startPaint);
    this.canvas.addEventListener('mousemove', this.paint);
    this.canvas.addEventListener('mouseup', this.endPaint);
    this.canvas.addEventListener('mouseleave', this.endPaint);
    this.canvas.addEventListener('click', this.handleCanvasClick);

    // Touch support (Set passive: false to allow preventDefault for scrolling prevention)
    this.canvas.addEventListener('touchstart', this.onTouchStart, { passive: false });
    this.canvas.addEventListener('touchmove', this.onTouchMove, { passive: false });
    this.canvas.addEventListener('touchend', this.onTouchEnd, { passive: false });

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
    this.canvas.parentNode.classList.toggle('todo-mode', this.currentTool === 'todo');
    this.canvas.parentNode.classList.toggle('schedule-mode', this.currentTool === 'schedule');

    document.getElementById('brush-mode').classList.toggle('active', this.currentTool === 'brush');
    document.getElementById('eraser-mode').classList.toggle('active', this.currentTool === 'eraser');
    document.getElementById('text-mode').classList.toggle('active', this.currentTool === 'text');
    document.getElementById('todo-mode').classList.toggle('active', this.currentTool === 'todo');
    document.getElementById('schedule-mode').classList.toggle('active', this.currentTool === 'schedule');

    document.getElementById('brush-color').disabled = this.currentTool === 'eraser' || this.currentTool === 'todo' || this.currentTool === 'schedule';
    document.getElementById('brush-size').disabled = this.currentTool === 'text' || this.currentTool === 'todo' || this.currentTool === 'schedule';

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
      // Check if we're clicking on a text element to drag/edit
      const textElement = this.findTextElementAt(e);
      if (textElement) {
        // Select for editing: populate UI fields
        this.selectedEditingText = textElement;
        document.getElementById('text-input').value = textElement.text;
        const fontMatch = textElement.font.match(/(\d+)px\s+(.*)/);
        if (fontMatch) {
          document.getElementById('font-size').value = fontMatch[1];
          document.getElementById('font-family').value = fontMatch[2];
        }
        this.textBold = /bold/.test(textElement.font);
        this.textItalic = /italic/.test(textElement.font);
        document.getElementById('text-bold').classList.toggle('primary', this.textBold);
        document.getElementById('text-italic').classList.toggle('primary', this.textItalic);
        document.getElementById('brush-color').value = textElement.color;
        this.brushColor = textElement.color;
        document.getElementById('add-text-btn').textContent = '更新文字';
        this.redrawAll();

        // Allow dragging
        this.isDraggingText = true;
        this.selectedTextElement = textElement;

        // Save current canvas state for dragging
        this.draggingCanvasContext = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);

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
    } else if (this.currentTool === 'todo') {
      // Check if we're clicking on a delete button first
      const deleteButtonTodo = this.findTodoDeleteButtonAt(e);
      if (deleteButtonTodo) {
        this.deleteTodoItem(deleteButtonTodo);
        return;
      }

      // Check if we're clicking on a todo item to drag
      const todoItem = this.findTodoItemAt(e);
      if (todoItem) {
        this.isDraggingText = true;
        this.selectedTodoItem = todoItem;

        // Save current canvas state for dragging
        this.draggingCanvasContext = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);

        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        // Calculate offset for smooth dragging
        this.dragOffsetX = todoItem.x - x;
        this.dragOffsetY = todoItem.y - y;

        return; // Don't place new todo
      }
    } else if (this.currentTool === 'schedule') {
      // Schedule mode - don't paint, handle through handleCanvasClick
      return;
    } else {
      this.painting = true;
      this.draw(e);
    }
  }

  endPaint() {
    if (this.isDraggingText) {
      // After dragging text or todo, redraw all elements to clean up old positions
      this.redrawAll();
      this.saveToHistory(); // Save state after dragging
    } else if (this.painting) {
      this.saveToHistory(); // Save state after drawing
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
    } else if (this.currentTool === 'todo') {
      if (this.isDraggingText && this.selectedTodoItem) {
        this.dragTodo(e);
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
    } else if (this.currentTool === 'text' && !this.isTextPlacementMode) {
      // Click on empty area → deselect editing text
      if (this.selectedEditingText && !this.findTextElementAt(e)) {
        this.deselectEditingText();
      }
    } else if (this.currentTool === 'todo' && this.isTodoPlacementMode) {
      this.placeTodo(e);
    } else if (this.currentTool === 'schedule') {
      // Handle schedule cell click for editing
      const cell = this.getScheduleCellAt(e);
      if (cell) {
        this.selectedScheduleCell = cell;
        const currentText = this.scheduleData[cell.row][cell.col];
        document.getElementById('schedule-input').value = currentText;
        document.getElementById('schedule-input').focus();
        // Show per-cell font size in the global font size input
        if (this.scheduleCellFontSizes) {
          document.getElementById('schedule-font-size').value = this.scheduleCellFontSizes[cell.row][cell.col];
        }
        // Redraw to show selection indicator
        this.redrawAll();
        // Show the input area
        const allScheduleTools = document.querySelectorAll('.schedule-tools');
        if (allScheduleTools.length > 2) {
          allScheduleTools[2].style.display = 'flex';
        }
      }
    }
  }

  onTouchStart(e) {
    e.preventDefault();
    const touch = e.touches[0];

    // If in placement mode or schedule mode, handle as a click
    const isPlacementMode = (this.currentTool === 'text' && this.isTextPlacementMode) ||
      (this.currentTool === 'todo' && this.isTodoPlacementMode) ||
      (this.currentTool === 'schedule');

    if (isPlacementMode) {
      const mouseEvent = new MouseEvent('click', {
        clientX: touch.clientX,
        clientY: touch.clientY,
        bubbles: true,
        cancelable: true
      });
      this.canvas.dispatchEvent(mouseEvent);
      return;
    }

    // Otherwise handle as normal drawing/dragging
    const mouseEvent = new MouseEvent('mousedown', {
      clientX: touch.clientX,
      clientY: touch.clientY,
      bubbles: true,
      cancelable: true
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

    // Restore the saved canvas state (with all other elements)
    if (this.draggingCanvasContext) {
      this.ctx.putImageData(this.draggingCanvasContext, 0, 0);
    }

    // Redraw all other text elements (except the one being dragged)
    this.textElements.forEach(item => {
      if (item !== this.selectedTextElement) {
        const m = this.getItemTransformMatrix(item);
        this.ctx.save();
        this.ctx.translate(item.x, item.y);
        this.ctx.transform(m.a, m.b, m.c, m.d, 0, 0);
        this.ctx.font = item.font;
        this.ctx.fillStyle = item.color;
        this.ctx.fillText(item.text, 0, 0);
        this.ctx.restore();
      }
    });

    // Redraw all todo items
    this.redrawTodoItems();

    // Draw the dragged text element on top
    const m = this.getItemTransformMatrix(this.selectedTextElement);
    this.ctx.save();
    this.ctx.translate(this.selectedTextElement.x, this.selectedTextElement.y);
    this.ctx.transform(m.a, m.b, m.c, m.d, 0, 0);
    this.ctx.font = this.selectedTextElement.font;
    this.ctx.fillStyle = this.selectedTextElement.color;
    this.ctx.fillText(this.selectedTextElement.text, 0, 0);
    this.ctx.restore();
  }

  dragTodo(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // Update todo position with offset
    this.selectedTodoItem.x = x + this.dragOffsetX;
    this.selectedTodoItem.y = y + this.dragOffsetY;

    // Restore the saved canvas state (with all other elements)
    if (this.draggingCanvasContext) {
      this.ctx.putImageData(this.draggingCanvasContext, 0, 0);
    }

    // Redraw all other todo items (except the one being dragged)
    this.todoItems.forEach(item => {
      if (item !== this.selectedTodoItem) {
        this.drawTodoItem(item);
      }
    });

    // Draw the dragged todo item on top
    this.drawTodoItem(this.selectedTodoItem);
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
      const bounds = this.getTextBounds(text, text.text);

      // Check if click is within text bounds (allowing for some margin)
      const margin = 5;
      if (x >= bounds.minX - margin &&
        x <= bounds.maxX + margin &&
        y >= bounds.minY - margin &&
        y <= bounds.maxY + margin) {
        return text;
      }
    }

    return null;
  }

  findTodoItemAt(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // Search through todo items in reverse order (top-most first)
    for (let i = this.todoItems.length - 1; i >= 0; i--) {
      const todo = this.todoItems[i];
      const bounds = this.getTextBounds(todo, todo.text);

      // Check if click is within todo bounds (allowing for some margin)
      const margin = 5;
      if (x >= bounds.minX - margin &&
        x <= bounds.maxX + margin &&
        y >= bounds.minY - margin &&
        y <= bounds.maxY + margin) {
        return todo;
      }
    }

    return null;
  }

  findTodoDeleteButtonAt(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // Search through todo items in reverse order (top-most first)
    for (let i = this.todoItems.length - 1; i >= 0; i--) {
      const todo = this.todoItems[i];

      if (!Number.isFinite(todo.deleteButtonCenterX) ||
        !Number.isFinite(todo.deleteButtonCenterY) ||
        !Number.isFinite(todo.deleteButtonHitRadius)) {
        continue;
      }

      const dx = x - todo.deleteButtonCenterX;
      const dy = y - todo.deleteButtonCenterY;
      if (dx * dx + dy * dy <= todo.deleteButtonHitRadius * todo.deleteButtonHitRadius) {
        return todo;
      }
    }

    return null;
  }

  deleteTodoItem(todoItem) {
    const index = this.todoItems.indexOf(todoItem);
    if (index > -1) {
      this.todoItems.splice(index, 1);
      // Redraw canvas to remove the deleted todo item
      this.redrawAll();
      this.saveToHistory();
    }
  }

  redrawAll() {
    // Clear canvas to white background
    this.ctx.fillStyle = 'white';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Redraw all elements in order
    this.redrawLineSegments();
    this.redrawTextElements();
    this.redrawTodoItems();
    this.drawSchedule(); // Redraw schedule if it exists
  }

  startTextPlacement() {
    // If editing an existing text element, update it
    if (this.selectedEditingText) {
      this.updateSelectedText();
      return;
    }

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
    this.isTodoPlacementMode = false;
    this.canvas.classList.remove('text-placement-mode');

    // reset dragging state
    this.isDraggingText = false;
    this.dragOffsetX = 0;
    this.dragOffsetY = 0;
    this.selectedTextElement = null;
    this.selectedTodoItem = null;
    this.draggingCanvasContext = null;

    // Deselect editing text
    if (this.selectedEditingText) {
      this.selectedEditingText = null;
      document.getElementById('text-input').value = '';
      document.getElementById('add-text-btn').textContent = '添加文字';
    }
  }

  updateSelectedText() {
    if (!this.selectedEditingText) return;

    const text = document.getElementById('text-input').value;
    const fontFamily = document.getElementById('font-family').value;
    const fontSize = document.getElementById('font-size').value;

    let fontStyle = '';
    if (this.textItalic) fontStyle += 'italic ';
    if (this.textBold) fontStyle += 'bold ';

    this.selectedEditingText.text = text;
    this.selectedEditingText.font = `${fontStyle}${fontSize}px ${fontFamily}`;
    this.selectedEditingText.color = this.brushColor;

    // Remove if text is empty
    if (!text.trim()) {
      const index = this.textElements.indexOf(this.selectedEditingText);
      if (index > -1) this.textElements.splice(index, 1);
    }

    this.redrawAll();
    this.saveToHistory();
    this.deselectEditingText();
  }

  getItemTransformMatrix(item) {
    return {
      a: item && Number.isFinite(item.a) ? item.a : 1,
      b: item && Number.isFinite(item.b) ? item.b : 0,
      c: item && Number.isFinite(item.c) ? item.c : 0,
      d: item && Number.isFinite(item.d) ? item.d : 1
    };
  }

  transformLocalPoint(item, localX, localY) {
    const m = this.getItemTransformMatrix(item);
    return {
      x: item.x + m.a * localX + m.c * localY,
      y: item.y + m.b * localX + m.d * localY
    };
  }

  getTextBounds(item, text) {
    this.ctx.font = item.font;
    const textWidth = this.ctx.measureText(text).width;
    const fontSizeMatch = item.font.match(/(\d+)px/);
    const textHeight = (fontSizeMatch ? parseInt(fontSizeMatch[1]) : 14) * 1.2;
    const corners = [
      this.transformLocalPoint(item, 0, -textHeight),
      this.transformLocalPoint(item, textWidth, -textHeight),
      this.transformLocalPoint(item, textWidth, 0),
      this.transformLocalPoint(item, 0, 0)
    ];
    const xs = corners.map(p => p.x);
    const ys = corners.map(p => p.y);
    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
      textWidth
    };
  }

  deselectEditingText() {
    this.selectedEditingText = null;
    document.getElementById('text-input').value = '';
    document.getElementById('add-text-btn').textContent = '添加文字';
    this.redrawAll();
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
      color: this.brushColor,
      a: 1,
      b: 0,
      c: 0,
      d: 1
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
      const m = this.getItemTransformMatrix(item);
      this.ctx.save();
      this.ctx.translate(item.x, item.y);
      this.ctx.transform(m.a, m.b, m.c, m.d, 0, 0);
      this.ctx.font = item.font;
      this.ctx.fillStyle = item.color;
      this.ctx.fillText(item.text, 0, 0);
      this.ctx.restore();
    });

    // Draw selection indicator for editing text
    if (this.selectedEditingText) {
      const item = this.selectedEditingText;
      const bounds = this.getTextBounds(item, item.text);
      const padding = 4;
      this.ctx.strokeStyle = '#0000FF';
      this.ctx.lineWidth = 1;
      this.ctx.setLineDash([4, 3]);
      this.ctx.strokeRect(
        bounds.minX - padding,
        bounds.minY - padding,
        (bounds.maxX - bounds.minX) + padding * 2,
        (bounds.maxY - bounds.minY) + padding * 2
      );
      this.ctx.setLineDash([]);
    }
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

  startTodoPlacement() {
    const todo = document.getElementById('todo-input').value.trim();
    if (!todo) {
      alert('请输入待办项内容');
      return;
    }

    this.isTodoPlacementMode = true;

    // Add visual feedback
    setCanvasTitle('点击画布放置待办项');
    this.canvas.classList.add('text-placement-mode');
  }

  placeTodo(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const todo = document.getElementById('todo-input').value;
    const fontSize = document.getElementById('todo-font-size').value;
    const fontFamily = document.getElementById('todo-font-family').value;

    // Build font style string with bold and italic
    let fontStyle = '';
    if (this.todoItalic) fontStyle += 'italic ';
    if (this.todoBold) fontStyle += 'bold ';
    fontStyle += `${fontSize}px ${fontFamily}`;

    // Create a new todo item
    const newTodo = {
      text: todo,
      x: x,
      y: y,
      font: fontStyle,
      color: this.todoColor,
      completed: false,
      a: 1,
      b: 0,
      c: 0,
      d: 1
    };

    // Add to our list of todo items
    this.todoItems.push(newTodo);

    // Select this todo item for immediate dragging
    this.selectedTodoItem = newTodo;
    this.draggingCanvasContext = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);

    // Draw todo on canvas
    this.drawTodoItem(newTodo);

    // Save to history after placing todo
    this.saveToHistory();

    // Reset
    document.getElementById('todo-input').value = '';
    this.isTodoPlacementMode = false;
    this.canvas.classList.remove('text-placement-mode');
    setCanvasTitle('拖动新添加待办项可调整位置');
  }

  drawTodoItem(todoItem) {
    const m = this.getItemTransformMatrix(todoItem);
    this.ctx.save();
    this.ctx.translate(todoItem.x, todoItem.y);
    this.ctx.transform(m.a, m.b, m.c, m.d, 0, 0);

    // Draw todo text
    this.ctx.font = todoItem.font;
    this.ctx.fillStyle = todoItem.color;
    this.ctx.fillText(todoItem.text, 0, 0);

    // Only draw delete button if showTodoDeleteButtons is true
    if (this.showTodoDeleteButtons) {
      // Calculate delete button position
      const textWidth = this.ctx.measureText(todoItem.text).width;
      const deleteButtonX = textWidth + 5;
      const deleteButtonY = 0;
      const deleteButtonSize = 12;

      // Draw delete button "×"
      this.ctx.font = 'bold 14px Arial';
      this.ctx.fillStyle = '#FF6B6B';
      this.ctx.fillText('×', deleteButtonX, deleteButtonY);

      // Store transformed delete button center for hit detection
      const hitPoint = this.transformLocalPoint(todoItem, deleteButtonX + 2, -deleteButtonSize / 2);
      todoItem.deleteButtonCenterX = hitPoint.x;
      todoItem.deleteButtonCenterY = hitPoint.y;
      todoItem.deleteButtonHitRadius = 10;
    } else {
      todoItem.deleteButtonCenterX = null;
      todoItem.deleteButtonCenterY = null;
      todoItem.deleteButtonHitRadius = null;
    }

    // Draw strikethrough if completed
    if (todoItem.completed) {
      const textWidth = this.ctx.measureText(todoItem.text).width;
      this.ctx.strokeStyle = '#000000';
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.moveTo(0, -4);
      this.ctx.lineTo(textWidth, -4);
      this.ctx.stroke();
    }
    this.ctx.restore();
  }

  redrawTodoItems() {
    // Redraw all todo items
    this.todoItems.forEach(item => {
      this.drawTodoItem(item);
    });
  }

  createSchedule() {
    // Get schedule configuration from form inputs
    this.scheduleDays = parseInt(document.getElementById('schedule-days').value);
    this.scheduleClasses = parseInt(document.getElementById('schedule-classes').value);
    this.scheduleFontFamily = document.getElementById('schedule-font-family').value;
    this.scheduleFontSize = parseInt(document.getElementById('schedule-font-size').value);
    this.scheduleColor = document.getElementById('schedule-color').value;

    // Clear old content (drawings, text, todos) to make room for new schedule
    this.lineSegments = [];
    this.textElements = [];
    this.todoItems = [];

    // Calculate cell dimensions based on canvas
    this.calculateScheduleDimensions();

    // Initialize schedule data (2D array: rows = classes + 1 (header), cols = days + 1 (time col))
    this.scheduleData = [];
    this.scheduleCellFontSizes = [];
    for (let i = 0; i <= this.scheduleClasses; i++) {
      this.scheduleData[i] = [];
      this.scheduleCellFontSizes[i] = [];
      for (let j = 0; j <= this.scheduleDays; j++) {
        this.scheduleCellFontSizes[i][j] = this.scheduleFontSize;
        if (i === 0 && j === 0) {
          this.scheduleData[i][j] = ''; // Top-left corner - leave empty
        } else if (i === 0) {
          this.scheduleData[i][j] = this.weekDays[j - 1]; // Header row - weekdays
        } else if (j === 0) {
          this.scheduleData[i][j] = `第${i}节`; // Time column
        } else {
          this.scheduleData[i][j] = ''; // Empty cells for courses
        }
      }
    }

    // Draw the schedule on canvas
    this.redrawAll();
    this.saveScheduleToLocalStorage(); // Save schedule to cache
    this.saveToHistory();
  }

  calculateScheduleDimensions() {
    // Calculate cell size based on canvas dimensions
    const padding = 20;
    const availableWidth = this.canvas.width - 2 * padding;
    const availableHeight = this.canvas.height - 2 * padding;

    // Calculate cell dimensions to fit content
    const cellWidth = Math.floor(availableWidth / (this.scheduleDays + 1)); // +1 for time column
    const cellHeight = Math.floor(availableHeight / (this.scheduleClasses + 1)); // +1 for header

    // Ensure cells are large enough for text
    this.scheduleCellWidth = Math.max(cellWidth, this.scheduleFontSize * 4);
    this.scheduleCellHeight = Math.max(cellHeight, this.scheduleFontSize * 2);

    // Adjust start position based on available space
    this.scheduleStartX = padding;
    this.scheduleStartY = padding;
  }

  drawSchedule() {
    if (!this.scheduleData) return;

    const cellWidth = this.scheduleCellWidth;
    const cellHeight = this.scheduleCellHeight;
    const startX = this.scheduleStartX;
    const startY = this.scheduleStartY;

    this.ctx.fillStyle = this.scheduleColor;
    this.ctx.strokeStyle = '#000000';
    this.ctx.lineWidth = 1;

    // Draw table grid and text
    for (let i = 0; i < this.scheduleData.length; i++) {
      for (let j = 0; j < this.scheduleData[i].length; j++) {
        const x = startX + j * cellWidth;
        const y = startY + i * cellHeight;

        // Draw cell border
        this.ctx.strokeRect(x, y, cellWidth, cellHeight);

        // Draw cell text with per-cell font size and multi-line support
        const text = this.scheduleData[i][j];
        if (text) {
          const cellFontSize = (this.scheduleCellFontSizes && this.scheduleCellFontSizes[i] && this.scheduleCellFontSizes[i][j])
            ? this.scheduleCellFontSizes[i][j] : this.scheduleFontSize;
          const font = `${cellFontSize}px ${this.scheduleFontFamily}`;
          this.ctx.font = font;
          this.ctx.fillStyle = this.scheduleColor;

          const lines = text.split('\n');
          const lineHeight = cellFontSize * 1.2;
          const totalTextHeight = lines.length * lineHeight;
          const textStartY = y + (cellHeight - totalTextHeight) / 2 + cellFontSize * 0.85;

          for (let l = 0; l < lines.length; l++) {
            const lineText = lines[l];
            const textX = x + (cellWidth - this.ctx.measureText(lineText).width) / 2;
            const textY = textStartY + l * lineHeight;
            this.ctx.fillText(lineText, textX, textY);
          }
        }
      }
    }

    // Draw selection indicator if enabled and a cell is selected
    if (this.showScheduleCellIndicator && this.selectedScheduleCell) {
      const row = this.selectedScheduleCell.row;
      const col = this.selectedScheduleCell.col;
      const x = startX + col * cellWidth;
      const y = startY + row * cellHeight;

      // Draw a small black dot in the top-right corner of selected cell
      this.ctx.fillStyle = '#000000';
      this.ctx.beginPath();
      this.ctx.arc(x + cellWidth - 5, y + 5, 3, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  updateScheduleCell(row, col, text) {
    if (this.scheduleData && row >= 0 && col >= 0 && row <= this.scheduleClasses && col <= this.scheduleDays) {
      this.scheduleData[row][col] = text;
      this.redrawAll();
      this.saveScheduleToLocalStorage(); // Save schedule to cache
      this.saveToHistory();
    }
  }

  getScheduleCellAt(e) {
    if (!this.scheduleData) return null;

    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const cellWidth = this.scheduleCellWidth;
    const cellHeight = this.scheduleCellHeight;
    const startX = this.scheduleStartX;
    const startY = this.scheduleStartY;

    // Calculate which cell was clicked
    const col = Math.floor((x - startX) / cellWidth);
    const row = Math.floor((y - startY) / cellHeight);

    // Check if click is within schedule bounds - allow all cells including header row and time column
    if (col >= 0 && row >= 0 && col <= this.scheduleDays && row <= this.scheduleClasses) {
      return { row, col };
    }

    return null;
  }

  confirmScheduleInput() {
    if (this.selectedScheduleCell) {
      const text = document.getElementById('schedule-input').value;
      this.updateScheduleCell(this.selectedScheduleCell.row, this.selectedScheduleCell.col, text);
      this.cancelScheduleInput();
    }
  }

  cancelScheduleInput() {
    this.selectedScheduleCell = null;
    document.getElementById('schedule-input').value = '';
    // Restore global font size display
    document.getElementById('schedule-font-size').value = this.scheduleFontSize;
    // Hide the input buttons
    const allScheduleTools = document.querySelectorAll('.schedule-tools');
    if (allScheduleTools.length > 2) {
      allScheduleTools[2].style.display = 'none';
    }
    // Redraw to remove the selection indicator
    if (this.scheduleData) {
      this.redrawAll();
    }
  }

  saveScheduleToLocalStorage() {
    try {
      const scheduleCache = {
        scheduleData: this.scheduleData,
        scheduleDays: this.scheduleDays,
        scheduleClasses: this.scheduleClasses,
        scheduleFontFamily: this.scheduleFontFamily,
        scheduleFontSize: this.scheduleFontSize,
        scheduleColor: this.scheduleColor,
        scheduleCellWidth: this.scheduleCellWidth,
        scheduleCellHeight: this.scheduleCellHeight,
        scheduleStartX: this.scheduleStartX,
        scheduleStartY: this.scheduleStartY,
        scheduleCellFontSizes: this.scheduleCellFontSizes
      };
      localStorage.setItem('scheduleCache', JSON.stringify(scheduleCache));
    } catch (e) {
      console.error('Failed to save schedule to localStorage:', e);
    }
  }

  async loadScheduleFromLocalStorage() {
    try {
      const savedData = localStorage.getItem('scheduleCache');
      if (!savedData) return false;

      const scheduleCache = JSON.parse(savedData);

      // Restore schedule configuration
      this.scheduleData = scheduleCache.scheduleData;
      this.scheduleDays = scheduleCache.scheduleDays;
      this.scheduleClasses = scheduleCache.scheduleClasses;
      this.scheduleFontFamily = scheduleCache.scheduleFontFamily;
      this.scheduleFontSize = scheduleCache.scheduleFontSize;
      this.scheduleColor = scheduleCache.scheduleColor;
      this.scheduleCellFontSizes = scheduleCache.scheduleCellFontSizes || null;

      // Initialize scheduleCellFontSizes if missing (old cache compatibility)
      if (!this.scheduleCellFontSizes && this.scheduleData) {
        this.scheduleCellFontSizes = [];
        for (let i = 0; i < this.scheduleData.length; i++) {
          this.scheduleCellFontSizes[i] = [];
          for (let j = 0; j < this.scheduleData[i].length; j++) {
            this.scheduleCellFontSizes[i][j] = this.scheduleFontSize;
          }
        }
      }

      // Recalculate dimensions based on current canvas size for proper adaptation
      this.calculateScheduleDimensions();

      if (this.scheduleData) {
        // Clear other elements to ensure a clean schedule view, matching createSchedule behavior
        this.lineSegments = [];
        this.textElements = [];
        this.todoItems = [];

        // Use redrawAll to clear canvas and draw the schedule correctly
        this.redrawAll();
        return true;
      }
      return false;
    } catch (e) {
      console.error('Failed to load schedule from localStorage:', e);
      return false;
    }
  }

  clearScheduleCache() {
    try {
      localStorage.removeItem('scheduleCache');
    } catch (e) {
      console.error('Failed to clear schedule cache:', e);
    }
  }

  transformElements(transformType, oldWidth, oldHeight, newWidth, newHeight) {
    const transformMatrix = (() => {
      if (transformType === 'rotate90') return { a: 0, b: 1, c: -1, d: 0 };
      if (transformType === 'mirror') return { a: -1, b: 0, c: 0, d: 1 };
      if (transformType === 'flip') return { a: 1, b: 0, c: 0, d: -1 };
      return { a: 1, b: 0, c: 0, d: 1 };
    })();

    const transformPoint = (x, y) => {
      const maxX = Math.max(0, newWidth - 1);
      const maxY = Math.max(0, newHeight - 1);
      const clamp = (value, max) => Math.max(0, Math.min(value, max));
      let mapped;
      if (transformType === 'rotate90') {
        mapped = { x: oldHeight - 1 - y, y: x };
      } else if (transformType === 'mirror') {
        mapped = { x: oldWidth - 1 - x, y: y };
      } else if (transformType === 'flip') {
        mapped = { x: x, y: oldHeight - 1 - y };
      } else {
        mapped = { x, y };
      }
      return {
        x: clamp(mapped.x, maxX),
        y: clamp(mapped.y, maxY)
      };
    };

    const multiplyMatrix = (m1, m2) => {
      return {
        a: m1.a * m2.a + m1.c * m2.b,
        b: m1.b * m2.a + m1.d * m2.b,
        c: m1.a * m2.c + m1.c * m2.d,
        d: m1.b * m2.c + m1.d * m2.d
      };
    };

    const originalSelectedTextElement = this.selectedTextElement;
    const originalSelectedEditingText = this.selectedEditingText;
    const originalSelectedTodoItem = this.selectedTodoItem;
    const textElementMap = new Map();
    const todoItemMap = new Map();

    this.textElements = this.textElements.map((item) => {
      const p = transformPoint(item.x, item.y);
      const currentMatrix = this.getItemTransformMatrix(item);
      const transformedMatrix = multiplyMatrix(transformMatrix, currentMatrix);
      const transformed = { ...item, x: p.x, y: p.y, ...transformedMatrix };
      textElementMap.set(item, transformed);
      return transformed;
    });

    this.todoItems = this.todoItems.map((item) => {
      const p = transformPoint(item.x, item.y);
      const currentMatrix = this.getItemTransformMatrix(item);
      const transformedMatrix = multiplyMatrix(transformMatrix, currentMatrix);
      const transformed = {
        ...item,
        x: p.x,
        y: p.y,
        ...transformedMatrix,
        deleteButtonCenterX: null,
        deleteButtonCenterY: null,
        deleteButtonHitRadius: null
      };
      todoItemMap.set(item, transformed);
      return transformed;
    });

    this.lineSegments = this.lineSegments.map((segment) => {
      if (segment.type === 'dot') {
        const p = transformPoint(segment.x, segment.y);
        return { ...segment, x: p.x, y: p.y };
      }
      const p1 = transformPoint(segment.x1, segment.y1);
      const p2 = transformPoint(segment.x2, segment.y2);
      return { ...segment, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
    });

    if (this.scheduleData) {
      const oldRows = this.scheduleData.length;
      const oldCols = this.scheduleData[0].length;
      const oldTableWidth = oldCols * this.scheduleCellWidth;
      const oldTableHeight = oldRows * this.scheduleCellHeight;

      const mapScheduleCell = (row, col) => {
        if (transformType === 'rotate90') {
          return { row: col, col: oldRows - 1 - row };
        }
        if (transformType === 'mirror') {
          return { row, col: oldCols - 1 - col };
        }
        if (transformType === 'flip') {
          return { row: oldRows - 1 - row, col };
        }
        return { row, col };
      };

      const newRows = transformType === 'rotate90' ? oldCols : oldRows;
      const newCols = transformType === 'rotate90' ? oldRows : oldCols;
      const newScheduleData = Array.from({ length: newRows }, () => Array(newCols).fill(''));
      const newCellFontSizes = Array.from({ length: newRows }, () => Array(newCols).fill(this.scheduleFontSize));

      for (let row = 0; row < oldRows; row++) {
        for (let col = 0; col < oldCols; col++) {
          const mapped = mapScheduleCell(row, col);
          newScheduleData[mapped.row][mapped.col] = this.scheduleData[row][col];
          if (this.scheduleCellFontSizes && this.scheduleCellFontSizes[row]) {
            newCellFontSizes[mapped.row][mapped.col] = this.scheduleCellFontSizes[row][col];
          }
        }
      }

      this.scheduleData = newScheduleData;
      this.scheduleCellFontSizes = newCellFontSizes;
      this.scheduleClasses = newRows - 1;
      this.scheduleDays = newCols - 1;

      if (transformType === 'rotate90') {
        const oldStartX = this.scheduleStartX;
        const oldStartY = this.scheduleStartY;
        const oldCellWidth = this.scheduleCellWidth;
        const oldCellHeight = this.scheduleCellHeight;
        this.scheduleCellWidth = oldCellHeight;
        this.scheduleCellHeight = oldCellWidth;
        this.scheduleStartX = oldHeight - (oldStartY + oldTableHeight);
        this.scheduleStartY = oldStartX;
      } else if (transformType === 'mirror') {
        this.scheduleStartX = oldWidth - (this.scheduleStartX + oldTableWidth);
      } else if (transformType === 'flip') {
        this.scheduleStartY = oldHeight - (this.scheduleStartY + oldTableHeight);
      }

      if (this.selectedScheduleCell) {
        const mapped = mapScheduleCell(this.selectedScheduleCell.row, this.selectedScheduleCell.col);
        this.selectedScheduleCell = { row: mapped.row, col: mapped.col };
      }

      // Keep schedule in visible area after transforms.
      const newTableWidth = newCols * this.scheduleCellWidth;
      const newTableHeight = newRows * this.scheduleCellHeight;
      this.scheduleStartX = Math.max(0, Math.min(this.scheduleStartX, newWidth - newTableWidth));
      this.scheduleStartY = Math.max(0, Math.min(this.scheduleStartY, newHeight - newTableHeight));
      this.saveScheduleToLocalStorage();
    }

    this.selectedTextElement = originalSelectedTextElement ? (textElementMap.get(originalSelectedTextElement) || null) : null;
    this.selectedEditingText = originalSelectedEditingText ? (textElementMap.get(originalSelectedEditingText) || null) : null;
    this.selectedTodoItem = originalSelectedTodoItem ? (todoItemMap.get(originalSelectedTodoItem) || null) : null;
  }

  clearElements() {
    this.textElements = [];
    this.lineSegments = [];
    this.todoItems = [];
    this.scheduleData = null; // Clear schedule data
    this.scheduleCellFontSizes = null; // Clear per-cell font sizes
  }
}
