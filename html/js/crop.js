let backgroundZoom = 1;
let backgroundPanX = 0;
let backgroundPanY = 0;
let isPanning = false;
let lastPanX = 0;
let lastPanY = 0;
let lastTouchDistance = 0;

function resetCropStates() {
  backgroundZoom = 1;
  backgroundPanX = 0;
  backgroundPanY = 0;
  isPanning = false;
  lastPanX = 0;
  lastPanY = 0;
}

function isCropMode() {
  return canvas.parentNode.classList.contains('crop-mode');
}

function exitCropMode() {
  canvas.parentNode.classList.remove('crop-mode');
  setCanvasTitle("");

  canvas.removeEventListener('wheel', handleBackgroundZoom);
  canvas.removeEventListener('mousedown', handleBackgroundPanStart);
  canvas.removeEventListener('mousemove', handleBackgroundPan);
  canvas.removeEventListener('mouseup', handleBackgroundPanEnd);
  canvas.removeEventListener('mouseleave', handleBackgroundPanEnd);
  canvas.removeEventListener('touchstart', handleTouchStart);
  canvas.removeEventListener('touchmove', handleTouchMove);
  canvas.removeEventListener('touchend', handleBackgroundPanEnd);
  canvas.removeEventListener('touchcancel', handleBackgroundPanEnd);
}

function initializeCrop() {
  const imageFile = document.getElementById('imageFile');
  if (imageFile.files.length == 0) {
    fillCanvas('white');
    return;
  }

  exitCropMode();
  resetCropStates();

  canvas.style.backgroundImage = `url(${URL.createObjectURL(imageFile.files[0])})`;
  canvas.style.backgroundSize = '100%';
  canvas.style.backgroundPosition = '';
  canvas.style.backgroundRepeat = 'no-repeat';

  // add event listeners for zoom and pan
  canvas.addEventListener('wheel', handleBackgroundZoom);
  canvas.addEventListener('mousedown', handleBackgroundPanStart);
  canvas.addEventListener('mousemove', handleBackgroundPan);
  canvas.addEventListener('mouseup', handleBackgroundPanEnd);
  canvas.addEventListener('mouseleave', handleBackgroundPanEnd);

  // Touch events for mobile devices
  canvas.addEventListener('touchstart', handleTouchStart);
  canvas.addEventListener('touchmove', handleTouchMove);
  canvas.addEventListener('touchend', handleBackgroundPanEnd);
  canvas.addEventListener('touchcancel', handleBackgroundPanEnd);

  // Make the canvas transparent
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  setCanvasTitle("裁剪模式: 可用鼠标滚轮或双指触摸缩放图片");
  canvas.parentNode.classList.add('crop-mode');
}

function finishCrop() {
  const imageFile = document.getElementById('imageFile');
  if (imageFile.files.length == 0) return;

  const image = new Image();
  image.onload = function () {
    URL.revokeObjectURL(this.src);

    const fieldsetRect = canvas.getBoundingClientRect();
    const scale = (image.width / fieldsetRect.width) / backgroundZoom;

    const sx = -backgroundPanX * scale;
    const sy = -backgroundPanY * scale;
    const sWidth = fieldsetRect.width * scale;
    const sHeight = fieldsetRect.height * scale;

    fillCanvas('white');
    ctx.drawImage(image, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);

    redrawTextElements();
    redrawLineSegments();
    convertDithering();

    exitCropMode();
    saveToHistory(); // Save after finishing crop
  };
  image.src = URL.createObjectURL(imageFile.files[0]);
}

function handleTouchStart(e) {
  e.preventDefault();
  if (e.touches.length === 1) {
    handleBackgroundPanStart(e.touches[0]);
  } else if (e.touches.length === 2) {
    isPanning = false; // Stop panning when zooming
    lastTouchDistance = getTouchDistance(e.touches);
  }
}

function handleTouchMove(e) {
  e.preventDefault();
  if (isPanning && e.touches.length === 1) {
    handleBackgroundPan(e.touches[0]);
  } else if (e.touches.length === 2) {
    const newDist = getTouchDistance(e.touches);
    if (lastTouchDistance > 0) {
      const zoomFactor = newDist / lastTouchDistance;
      backgroundZoom *= zoomFactor;
      backgroundZoom = Math.max(0.1, Math.min(5, backgroundZoom)); // Limit zoom range
      updateBackgroundTransform();
    }
    lastTouchDistance = newDist;
  }
}

function handleBackgroundZoom(e) {
  e.preventDefault();
  const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
  backgroundZoom *= zoomFactor;
  backgroundZoom = Math.max(0.1, Math.min(5, backgroundZoom)); // Limit zoom range
  updateBackgroundTransform();
}

function handleBackgroundPanStart(e) {
  isPanning = true;
  lastPanX = e.clientX;
  lastPanY = e.clientY;
  canvas.style.cursor = 'grabbing';
}

function handleBackgroundPan(e) {
  if (isPanning) {
    const deltaX = e.clientX - lastPanX;
    const deltaY = e.clientY - lastPanY;
    backgroundPanX += deltaX;
    backgroundPanY += deltaY;
    lastPanX = e.clientX;
    lastPanY = e.clientY;
    updateBackgroundTransform();
  }
}

function handleBackgroundPanEnd() {
  isPanning = false;
  lastTouchDistance = 0; // Reset touch distance
  canvas.style.cursor = 'grab';
}

function updateBackgroundTransform() {
  canvas.style.backgroundSize = `${100 * backgroundZoom}%`;
  canvas.style.backgroundPosition = `${backgroundPanX}px ${backgroundPanY}px`;
}

function getTouchDistance(touches) {
  const touch1 = touches[0];
  const touch2 = touches[1];
  return Math.sqrt(
    Math.pow(touch2.clientX - touch1.clientX, 2) +
    Math.pow(touch2.clientY - touch1.clientY, 2)
  );
}

function initCropTools() {
  document.getElementById('crop-zoom-in').addEventListener('click', (e) => {
    e.preventDefault();
    handleBackgroundZoom({ preventDefault: () => {}, deltaY: -1 });
  });

  document.getElementById('crop-zoom-out').addEventListener('click', (e) => {
    e.preventDefault();
    handleBackgroundZoom({ preventDefault: () => {}, deltaY: 1 });
  });

  document.getElementById('crop-move-left').addEventListener('click', (e) => {
    e.preventDefault();
    backgroundPanX -= 10;
    updateBackgroundTransform();
  });

  document.getElementById('crop-move-right').addEventListener('click', (e) => {
    e.preventDefault();
    backgroundPanX += 10;
    updateBackgroundTransform();
  });

  document.getElementById('crop-move-up').addEventListener('click', (e) => {
    e.preventDefault();
    backgroundPanY -= 10;
    updateBackgroundTransform();
  });

  document.getElementById('crop-move-down').addEventListener('click', (e) => {
    e.preventDefault();
    backgroundPanY += 10;
    updateBackgroundTransform();
  });
}