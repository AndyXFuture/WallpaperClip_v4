// State
const state = {
    files: [],
    processedFiles: [], // { name: string, blob: Blob }
    currentIndex: 0,
    targetRatio: 32 / 9, // Default
    currentImage: null, // Image object
    scale: 1,
    imageDrawParams: { x: 0, y: 0, w: 0, h: 0 },
    cropBoxParams: { x: 0, y: 0, w: 0, h: 0 }, // Relative to viewport
    isDraggingCrop: false,
    dragStartY: 0,
    dragStartX: 0,
    boxStartX: 0,
    boxStartY: 0
};

// Elements
const els = {
    themeSwitch: document.getElementById('checkbox'),
    steps: {
        config: document.getElementById('step-config'),
        crop: document.getElementById('step-crop'),
        done: document.getElementById('step-done')
    },
    ratioBtns: document.querySelectorAll('.ratio-btn'),
    customRatioBtn: document.getElementById('custom-ratio-btn'),
    customRatioInput: document.getElementById('custom-ratio-input'),
    customW: document.getElementById('custom-w'),
    customH: document.getElementById('custom-h'),
    fileInput: document.getElementById('file-input'),
    dropZone: document.getElementById('drop-zone'),
    fileListInfo: document.getElementById('file-list-info'),
    fileCount: document.getElementById('file-count'),
    startBtn: document.getElementById('start-btn'),
    canvas: document.getElementById('crop-canvas'),
    ctx: document.getElementById('crop-canvas').getContext('2d'),
    cropOverlay: document.getElementById('crop-overlay'),
    cropBox: document.querySelector('.crop-box'),
    floatingControls: document.getElementById('floating-controls'),
    dragHandle: document.querySelector('.drag-handle'),
    currentIndexDisplay: document.getElementById('current-index'),
    totalCountDisplay: document.getElementById('total-count'),
    skipBtn: document.getElementById('skip-btn'),
    nextBtn: document.getElementById('next-btn'),
    downloadArea: document.getElementById('download-area'),
    restartBtn: document.getElementById('restart-btn'),
    previewBtn: document.getElementById('preview-btn'),
    previewModal: document.getElementById('preview-modal'),
    previewImage: document.getElementById('preview-image'),
    closePreview: document.getElementById('close-preview')
};

// --- Initialization ---
function init() {
    // Theme Switcher
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    els.themeSwitch.checked = savedTheme === 'dark';

    els.themeSwitch.addEventListener('change', (e) => {
        const theme = e.target.checked ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    });

    // Ratio Selection
    els.ratioBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.id === 'custom-ratio-btn') {
                els.customRatioInput.classList.remove('hidden');
                updateCustomRatio();
            } else {
                els.customRatioInput.classList.add('hidden');
                const [w, h] = btn.dataset.ratio.split(':').map(Number);
                state.targetRatio = w / h;
            }
            
            els.ratioBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // Custom Ratio Input
    const updateCustomRatio = () => {
        const w = parseFloat(els.customW.value);
        const h = parseFloat(els.customH.value);
        if (w && h) {
            state.targetRatio = w / h;
        }
    };
    els.customW.addEventListener('input', updateCustomRatio);
    els.customH.addEventListener('input', updateCustomRatio);

    // File Upload
    els.fileInput.addEventListener('change', handleFiles);
    
    // Drag and Drop
    els.dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        els.dropZone.style.borderColor = 'var(--primary-color)';
    });
    els.dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        els.dropZone.style.borderColor = 'var(--border-color)';
    });
    els.dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        els.dropZone.style.borderColor = 'var(--border-color)';
        if (e.dataTransfer.files.length) {
            els.fileInput.files = e.dataTransfer.files;
            handleFiles({ target: els.fileInput });
        }
    });

    // Start Button
    els.startBtn.addEventListener('click', startProcess);

    // Crop Actions
    els.skipBtn.addEventListener('click', () => nextImage(false));
    els.nextBtn.addEventListener('click', () => nextImage(true));
    els.restartBtn.addEventListener('click', () => location.reload());

    // Preview
    els.previewBtn.addEventListener('click', showPreview);
    els.closePreview.addEventListener('click', closePreview);
    els.previewModal.addEventListener('click', closePreview);
    
    // Listen for fullscreen exit to close modal
    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement) {
            els.previewModal.classList.add('hidden');
            els.previewImage.src = '';
        }
    });

    // Window Resize
    window.addEventListener('resize', () => {
        if (state.currentImage) {
            renderCropScreen();
        }
    });

    // Crop Box Dragging
    initCropBoxDrag();

    // Floating Window Dragging
    initFloatingWindowDrag();
}

function handleFiles(e) {
    const files = Array.from(e.target.files).filter(f => f.type.startsWith('image/'));
    if (files.length > 0) {
        state.files = files;
        els.fileCount.textContent = files.length;
        els.fileListInfo.classList.remove('hidden');
        els.startBtn.disabled = false;
    }
}

function startProcess() {
    if (state.files.length === 0) return;
    
    state.currentIndex = 0;
    state.processedFiles = [];
    
    switchStep('crop');
    els.totalCountDisplay.textContent = state.files.length;
    
    loadCurrentImage();
}

function switchStep(stepName) {
    Object.values(els.steps).forEach(el => el.classList.remove('active'));
    els.steps[stepName].classList.add('active');
}

// --- Crop Logic ---

function loadCurrentImage() {
    if (state.currentIndex >= state.files.length) {
        finishProcess();
        return;
    }

    els.currentIndexDisplay.textContent = state.currentIndex + 1;
    
    // Update button text for last image
    if (state.currentIndex === state.files.length - 1) {
        els.nextBtn.textContent = '完成';
    } else {
        els.nextBtn.textContent = '下一个';
    }

    const file = state.files[state.currentIndex];
    const reader = new FileReader();
    
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            state.currentImage = img;
            renderCropScreen();
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function renderCropScreen() {
    if (!state.currentImage) return;

    const img = state.currentImage;
    const canvas = els.canvas;
    const ctx = els.ctx;
    
    // Set canvas to full window size
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Calculate image fit (contain)
    const containerRatio = canvas.width / canvas.height;
    const imageRatio = img.width / img.height;

    let drawW, drawH, drawX, drawY;

    if (containerRatio > imageRatio) {
        // Container is wider than image -> Fit Height
        drawH = canvas.height;
        drawW = drawH * imageRatio;
        drawY = 0;
        drawX = (canvas.width - drawW) / 2;
    } else {
        // Container is taller than image -> Fit Width
        drawW = canvas.width;
        drawH = drawW / imageRatio;
        drawX = 0;
        drawY = (canvas.height - drawH) / 2;
    }

    state.imageDrawParams = { x: drawX, y: drawY, w: drawW, h: drawH };
    state.scale = drawW / img.width;

    // Draw Image
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Draw dark background
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, drawX, drawY, drawW, drawH);

    // Initialize Crop Box
    initCropBox();
    
    // Draw Mask
    // We can't draw the mask on canvas because the crop box is an HTML element that moves.
    // Instead, we use the massive box-shadow on the crop box to simulate the mask.
}

function initCropBox() {
    const { w: imgW, h: imgH, x: imgX, y: imgY } = state.imageDrawParams;
    const targetRatio = state.targetRatio;
    const imageRatio = imgW / imgH;

    let boxW, boxH;

    if (targetRatio > imageRatio) {
        // Crop is wider -> Fit Width
        boxW = imgW;
        boxH = boxW / targetRatio;
    } else {
        // Crop is taller -> Fit Height
        boxH = imgH;
        boxW = boxH * targetRatio;
    }

    // Center initially
    const boxX = imgX + (imgW - boxW) / 2;
    const boxY = imgY + (imgH - boxH) / 2;

    state.cropBoxParams = { x: boxX, y: boxY, w: boxW, h: boxH };
    updateCropBoxUI();
}

function updateCropBoxUI() {
    const { x, y, w, h } = state.cropBoxParams;
    els.cropBox.style.left = `${x}px`;
    els.cropBox.style.top = `${y}px`;
    els.cropBox.style.width = `${w}px`;
    els.cropBox.style.height = `${h}px`;
}

function initCropBoxDrag() {
    els.cropBox.addEventListener('mousedown', (e) => {
        state.isDraggingCrop = true;
        state.dragStartX = e.clientX;
        state.dragStartY = e.clientY;
        state.boxStartX = state.cropBoxParams.x;
        state.boxStartY = state.cropBoxParams.y;
        e.preventDefault(); // Prevent text selection
    });

    window.addEventListener('mousemove', (e) => {
        if (!state.isDraggingCrop) return;

        const dx = e.clientX - state.dragStartX;
        const dy = e.clientY - state.dragStartY;

        let newX = state.boxStartX + dx;
        let newY = state.boxStartY + dy;

        // Constrain to image bounds
        const { x: imgX, y: imgY, w: imgW, h: imgH } = state.imageDrawParams;
        const { w: boxW, h: boxH } = state.cropBoxParams;

        // Allow slight tolerance or strict? Strict.
        // But logic depends on which dimension is "fitting".
        
        // If fit width (Target > ImageRatio): X is fixed (relative to image), Y is movable.
        // Actually, user said: "16:9 image with 32:9 crop box can only move up/down"
        // In this case, boxW == imgW. So X should be locked to imgX.
        
        // General constraint:
        // newX >= imgX
        // newX + boxW <= imgX + imgW
        
        if (newX < imgX) newX = imgX;
        if (newX + boxW > imgX + imgW) newX = imgX + imgW - boxW;

        if (newY < imgY) newY = imgY;
        if (newY + boxH > imgY + imgH) newY = imgY + imgH - boxH;

        state.cropBoxParams.x = newX;
        state.cropBoxParams.y = newY;
        updateCropBoxUI();
    });

    window.addEventListener('mouseup', () => {
        state.isDraggingCrop = false;
    });
}

function showPreview() {
    if (!state.currentImage) return;

    const { x: boxX, y: boxY, w: boxW, h: boxH } = state.cropBoxParams;
    const { x: imgX, y: imgY } = state.imageDrawParams;
    
    // Calculate crop coordinates relative to original image
    const scale = state.scale;
    const realX = (boxX - imgX) / scale;
    const realY = (boxY - imgY) / scale;
    const realW = boxW / scale;
    const realH = boxH / scale;

    // Create off-screen canvas for cropping
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = realW;
    cropCanvas.height = realH;
    const ctx = cropCanvas.getContext('2d');
    
    ctx.drawImage(
        state.currentImage, 
        realX, realY, realW, realH, 
        0, 0, realW, realH
    );

    els.previewImage.src = cropCanvas.toDataURL('image/png');
    els.previewModal.classList.remove('hidden');

    // Request Fullscreen
    if (els.previewModal.requestFullscreen) {
        els.previewModal.requestFullscreen().catch(err => {
            console.log('Error attempting to enable full-screen mode:', err);
        });
    }
}

function closePreview() {
    // If in fullscreen mode, exit it
    if (document.fullscreenElement) {
        document.exitFullscreen().catch(err => {
            console.log('Error attempting to exit full-screen mode:', err);
        });
    } else {
        // If not in fullscreen (or failed to exit), just hide
        els.previewModal.classList.add('hidden');
        els.previewImage.src = '';
    }
}

function nextImage(save) {
    if (save) {
        // Process Crop
        const { x: boxX, y: boxY, w: boxW, h: boxH } = state.cropBoxParams;
        const { x: imgX, y: imgY } = state.imageDrawParams;
        
        // Calculate crop coordinates relative to original image
        const scale = state.scale;
        const realX = (boxX - imgX) / scale;
        const realY = (boxY - imgY) / scale;
        const realW = boxW / scale;
        const realH = boxH / scale;

        // Create off-screen canvas for cropping
        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = realW;
        cropCanvas.height = realH;
        const ctx = cropCanvas.getContext('2d');
        
        ctx.drawImage(
            state.currentImage, 
            realX, realY, realW, realH, 
            0, 0, realW, realH
        );

        cropCanvas.toBlob((blob) => {
            const originalName = state.files[state.currentIndex].name;
            // Remove extension and append info if needed, or just keep name
            // User requirement: "Packed into zip... Zip named with timestamp". 
            // Files inside? Probably keep original names or sequence. 
            // Let's keep original name.
            state.processedFiles.push({
                name: originalName,
                blob: blob
            });
            
            state.currentIndex++;
            loadCurrentImage();
        }, 'image/png'); // Default to PNG for high quality
    } else {
        state.currentIndex++;
        loadCurrentImage();
    }
}

// --- Floating Window Drag ---
function initFloatingWindowDrag() {
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    els.dragHandle.addEventListener('mousedown', (e) => {
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        
        const rect = els.floatingControls.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;
        
        // Convert to style left/top (remove right/bottom if set)
        // Resetting right/bottom to auto and setting left/top
        els.floatingControls.style.right = 'auto';
        els.floatingControls.style.bottom = 'auto';
        els.floatingControls.style.left = `${initialLeft}px`;
        els.floatingControls.style.top = `${initialTop}px`;
        
        e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        els.floatingControls.style.left = `${initialLeft + dx}px`;
        els.floatingControls.style.top = `${initialTop + dy}px`;
    });

    window.addEventListener('mouseup', () => {
        isDragging = false;
    });
}

// --- Finish & Download ---
function finishProcess() {
    switchStep('done');
    
    if (state.processedFiles.length === 0) {
        els.downloadArea.innerHTML = '<p>没有裁切任何图片。</p>';
        return;
    }

    const zip = new JSZip();
    state.processedFiles.forEach(file => {
        zip.file(file.name, file.blob);
    });

    // Generate Zip Name: YYYYMMDD_HHMMSS.zip
    const now = new Date();
    const timestamp = now.getFullYear().toString() +
        (now.getMonth() + 1).toString().padStart(2, '0') +
        now.getDate().toString().padStart(2, '0') + '_' +
        now.getHours().toString().padStart(2, '0') +
        now.getMinutes().toString().padStart(2, '0') +
        now.getSeconds().toString().padStart(2, '0');
    const zipName = `wallpapers_${timestamp}.zip`;

    zip.generateAsync({ type: 'blob' }).then(function(content) {
        // Create download link
        const url = URL.createObjectURL(content);
        els.downloadArea.innerHTML = `
            <p>打包完成！</p>
            <a href="${url}" download="${zipName}" class="download-link">
                <i class="fas fa-download"></i> 点击下载 ${zipName}
            </a>
        `;
        
        // Auto download? Maybe annoying. Let user click.
        // saveAs(content, zipName); // If using FileSaver
    });
}

// Run init
init();
