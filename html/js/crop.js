class CropManager {
  constructor(canvas, ctx) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.backgroundZoom = 1;
    this.backgroundPanX = 0;
    this.backgroundPanY = 0;
    this.isPanning = false;
    this.lastPanX = 0;
    this.lastPanY = 0;
    this.lastTouchDistance = 0;

    // Bind event handlers
    this.handleBackgroundZoom = this.handleBackgroundZoom.bind(this);
    this.handleBackgroundPanStart = this.handleBackgroundPanStart.bind(this);
    this.handleBackgroundPan = this.handleBackgroundPan.bind(this);
    this.handleBackgroundPanEnd = this.handleBackgroundPanEnd.bind(this);
    this.handleTouchStart = this.handleTouchStart.bind(this);
    this.handleTouchMove = this.handleTouchMove.bind(this);
  }

  resetStates() {
    this.backgroundZoom = 1;
    this.backgroundPanX = 0;
    this.backgroundPanY = 0;
    this.isPanning = false;
    this.lastPanX = 0;
    this.lastPanY = 0;
    this.lastTouchDistance = 0;
  }

  isCropMode() {
    return this.canvas.parentNode.classList.contains('crop-mode');
  }

  exitCropMode() {
    this.canvas.parentNode.classList.remove('crop-mode');
    setCanvasTitle("");

    this.canvas.removeEventListener('wheel', this.handleBackgroundZoom);
    this.canvas.removeEventListener('mousedown', this.handleBackgroundPanStart);
    this.canvas.removeEventListener('mousemove', this.handleBackgroundPan);
    this.canvas.removeEventListener('mouseup', this.handleBackgroundPanEnd);
    this.canvas.removeEventListener('mouseleave', this.handleBackgroundPanEnd);
    this.canvas.removeEventListener('touchstart', this.handleTouchStart);
    this.canvas.removeEventListener('touchmove', this.handleTouchMove);
    this.canvas.removeEventListener('touchend', this.handleBackgroundPanEnd);
    this.canvas.removeEventListener('touchcancel', this.handleBackgroundPanEnd);
  }

  initializeCrop() {
    const imageFile = document.getElementById('imageFile');
    if (imageFile.files.length == 0) {
      fillCanvas('white');
      return;
    }

    this.exitCropMode();
    this.resetStates();

    this.canvas.style.backgroundImage = `url(${URL.createObjectURL(imageFile.files[0])})`;
    this.canvas.style.backgroundSize = '100%';
    this.canvas.style.backgroundPosition = '';
    this.canvas.style.backgroundRepeat = 'no-repeat';

    // add event listeners for zoom and pan
    this.canvas.addEventListener('wheel', this.handleBackgroundZoom);
    this.canvas.addEventListener('mousedown', this.handleBackgroundPanStart);
    this.canvas.addEventListener('mousemove', this.handleBackgroundPan);
    this.canvas.addEventListener('mouseup', this.handleBackgroundPanEnd);
    this.canvas.addEventListener('mouseleave', this.handleBackgroundPanEnd);

    // Touch events for mobile devices
    this.canvas.addEventListener('touchstart', this.handleTouchStart);
    this.canvas.addEventListener('touchmove', this.handleTouchMove);
    this.canvas.addEventListener('touchend', this.handleBackgroundPanEnd);
    this.canvas.addEventListener('touchcancel', this.handleBackgroundPanEnd);

    // Make the canvas transparent
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    setCanvasTitle("裁剪模式: 可用鼠标滚轮或双指触摸缩放图片");
    this.canvas.parentNode.classList.add('crop-mode');
  }

  finishCrop(callback) {
    const imageFile = document.getElementById('imageFile');
    if (imageFile.files.length == 0) return;

    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(image.src);

      const fieldsetRect = this.canvas.getBoundingClientRect();
      const scale = (image.width / fieldsetRect.width) / this.backgroundZoom;

      const sx = -this.backgroundPanX * scale;
      const sy = -this.backgroundPanY * scale;
      const sWidth = fieldsetRect.width * scale;
      const sHeight = fieldsetRect.height * scale;

      fillCanvas('white');
      this.ctx.drawImage(image, sx, sy, sWidth, sHeight, 0, 0, this.canvas.width, this.canvas.height);

      this.exitCropMode();
      if (callback) callback();
    };
    image.src = URL.createObjectURL(imageFile.files[0]);
  }

  handleTouchStart(e) {
    e.preventDefault();
    if (e.touches.length === 1) {
      this.handleBackgroundPanStart(e.touches[0]);
    } else if (e.touches.length === 2) {
      this.isPanning = false; // Stop panning when zooming
      this.lastTouchDistance = this.getTouchDistance(e.touches);
    }
  }

  handleTouchMove(e) {
    e.preventDefault();
    if (this.isPanning && e.touches.length === 1) {
      this.handleBackgroundPan(e.touches[0]);
    } else if (e.touches.length === 2) {
      const newDist = this.getTouchDistance(e.touches);
      if (this.lastTouchDistance > 0) {
        const zoomFactor = newDist / this.lastTouchDistance;
        this.backgroundZoom *= zoomFactor;
        this.backgroundZoom = Math.max(0.1, Math.min(5, this.backgroundZoom)); // Limit zoom range
        this.updateBackgroundTransform();
      }
      this.lastTouchDistance = newDist;
    }
  }

  handleBackgroundZoom(e) {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    this.backgroundZoom *= zoomFactor;
    this.backgroundZoom = Math.max(0.1, Math.min(5, this.backgroundZoom)); // Limit zoom range
    this.updateBackgroundTransform();
  }

  handleBackgroundPanStart(e) {
    this.isPanning = true;
    this.lastPanX = e.clientX;
    this.lastPanY = e.clientY;
    this.canvas.style.cursor = 'grabbing';
  }

  handleBackgroundPan(e) {
    if (this.isPanning) {
      const deltaX = e.clientX - this.lastPanX;
      const deltaY = e.clientY - this.lastPanY;
      this.backgroundPanX += deltaX;
      this.backgroundPanY += deltaY;
      this.lastPanX = e.clientX;
      this.lastPanY = e.clientY;
      this.updateBackgroundTransform();
    }
  }

  handleBackgroundPanEnd() {
    this.isPanning = false;
    this.lastTouchDistance = 0; // Reset touch distance
    this.canvas.style.cursor = 'grab';
  }

  updateBackgroundTransform() {
    this.canvas.style.backgroundSize = `${100 * this.backgroundZoom}%`;
    this.canvas.style.backgroundPosition = `${this.backgroundPanX}px ${this.backgroundPanY}px`;
  }

  getTouchDistance(touches) {
    const touch1 = touches[0];
    const touch2 = touches[1];
    return Math.sqrt(
      Math.pow(touch2.clientX - touch1.clientX, 2) +
      Math.pow(touch2.clientY - touch1.clientY, 2)
    );
  }

  initCropTools() {
    document.getElementById('crop-zoom-in').addEventListener('click', (e) => {
      e.preventDefault();
      this.handleBackgroundZoom({ preventDefault: () => { }, deltaY: -1 });
    });

    document.getElementById('crop-zoom-out').addEventListener('click', (e) => {
      e.preventDefault();
      this.handleBackgroundZoom({ preventDefault: () => { }, deltaY: 1 });
    });

    document.getElementById('crop-move-left').addEventListener('click', (e) => {
      e.preventDefault();
      this.backgroundPanX -= 10;
      this.updateBackgroundTransform();
    });

    document.getElementById('crop-move-right').addEventListener('click', (e) => {
      e.preventDefault();
      this.backgroundPanX += 10;
      this.updateBackgroundTransform();
    });

    document.getElementById('crop-move-up').addEventListener('click', (e) => {
      e.preventDefault();
      this.backgroundPanY -= 10;
      this.updateBackgroundTransform();
    });

    document.getElementById('crop-move-down').addEventListener('click', (e) => {
      e.preventDefault();
      this.backgroundPanY += 10;
      this.updateBackgroundTransform();
    });
  }
}