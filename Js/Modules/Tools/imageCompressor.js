// Image compressor module: carga múltiples imágenes, escala y convierte a JPG usando canvas
const state = {
  items: [] // {id, file, nodes, compressed, blobUrl}
};

const MAX_DIM_CAP = 600; // no queremos imágenes > 600x600

function $(sel, ctx = document) { return ctx.querySelector(sel); }

function bytesToSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024, dm = 2, sizes = ['B','KB','MB','GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function readFileAsDataURL(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

function computeTargetDims(w, h, maxW, maxH) {
  const ratio = Math.min(1, Math.min(maxW / w, maxH / h));
  return { w: Math.max(1, Math.floor(w * ratio)), h: Math.max(1, Math.floor(h * ratio)) };
}

function imageToJpegBlob(img, maxW, maxH, quality = 0.8) {
  const dims = computeTargetDims(img.naturalWidth, img.naturalHeight, maxW, maxH);
  const canvas = document.createElement('canvas');
  canvas.width = dims.w; canvas.height = dims.h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((res) => canvas.toBlob(b => res(b), 'image/jpeg', quality));
}

function createItemElement(file, id) {
  const div = document.createElement('div');
  div.className = 'compressor-item';
  div.dataset.id = id;

  const img = document.createElement('img'); img.className = 'preview-thumb';
  const info = document.createElement('div'); info.className = 'item-info';
  const title = document.createElement('div'); title.className = 'name'; title.textContent = file.name;
  const meta = document.createElement('div'); meta.className = 'meta'; meta.textContent = `${file.type || 'image'} • ${bytesToSize(file.size)}`;
  info.appendChild(title); info.appendChild(meta);

  const actions = document.createElement('div'); actions.className = 'item-actions';
  const status = document.createElement('div'); status.className = 'small-muted'; status.textContent = 'Pendiente';
  const link = document.createElement('a'); link.textContent = 'Descargar'; link.style.display = 'none'; link.href = '#';
  const removeBtn = document.createElement('button'); removeBtn.className = 'btn btn-secondary'; removeBtn.textContent = 'Eliminar'; removeBtn.style.padding = '0.25rem 0.45rem';
  removeBtn.addEventListener('click', () => removeItemById(id));
  actions.appendChild(status); actions.appendChild(link); actions.appendChild(removeBtn);

  div.appendChild(img); div.appendChild(info); div.appendChild(actions);
  return {el: div, imgEl: img, statusEl: status, linkEl: link, removeBtn};
}

function findItemIndexById(id) { return state.items.findIndex(i => i.id === id); }

function removeItemById(id) {
  const idx = findItemIndexById(id);
  if (idx === -1) return;
  const it = state.items[idx];
  if (it.blobUrl) URL.revokeObjectURL(it.blobUrl);
  if (it.nodes && it.nodes.el && it.nodes.el.parentNode) it.nodes.el.parentNode.removeChild(it.nodes.el);
  state.items.splice(idx,1);
}

async function handleFiles(fileList) {
  const arr = Array.from(fileList).filter(f => f && f.type && f.type.startsWith('image'));
  const list = $('#compressor-list');
  for (let i=0;i<arr.length;i++) {
    const file = arr[i];
    const id = `${Date.now()}-${Math.random().toString(36).slice(2,9)}`;
    const item = { id, file, nodes: createItemElement(file, id), compressed: false, blobUrl: null };
    state.items.push(item);
    list.appendChild(item.nodes.el);
    try {
      const dataUrl = await readFileAsDataURL(file);
      item.nodes.imgEl.src = dataUrl;
    } catch (e) {
      item.nodes.statusEl.textContent = 'Error lectura';
    }
  }
}

async function compressAll() {
  const userMaxW = parseInt($('#compress-max-width').value, 10) || MAX_DIM_CAP;
  const userMaxH = parseInt($('#compress-max-height').value, 10) || MAX_DIM_CAP;
  const maxW = Math.min(userMaxW, MAX_DIM_CAP);
  const maxH = Math.min(userMaxH, MAX_DIM_CAP);
  const quality = Math.min(1, Math.max(0.05, parseFloat($('#compress-quality').value) || 0.8));

  for (let item of state.items) {
    const nodes = item.nodes;
    if (item.compressed) {
      nodes.statusEl.textContent = 'Ya convertido';
      continue; // no volver a convertir
    }
    nodes.statusEl.textContent = 'Comprimiendo...';
    try {
      const dataUrl = await readFileAsDataURL(item.file);
      const img = await loadImage(dataUrl);
      const blob = await imageToJpegBlob(img, maxW, maxH, quality);
      const outName = (item.file.name.replace(/\.[^/.]+$/, '')) + '.jpg';
      const url = URL.createObjectURL(blob);
      item.blobUrl = url;
      nodes.linkEl.href = url;
      nodes.linkEl.download = outName;
      nodes.linkEl.style.display = 'inline-block';
      nodes.linkEl.onclick = () => setTimeout(()=> URL.revokeObjectURL(url), 1000);
      nodes.statusEl.textContent = `Listo — ${bytesToSize(blob.size)}`;
      item.compressed = true;
      nodes.el.classList.add('converted');
    } catch (e) {
      console.error('compress error', e);
      nodes.statusEl.textContent = 'Error al comprimir';
    }
  }
}

function clearConvertedList() {
  // eliminar todos los items marcados como compressed
  const toRemove = state.items.filter(i => i.compressed).map(i => i.id);
  toRemove.forEach(id => removeItemById(id));
}

function init() {
  const fileInput = $('#compressor-input');
  const drop = $('#compressor-drop');
  const compressBtn = $('#compress-btn');
  const clearBtn = $('#clear-compressed-btn');

  drop.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('dragover'); });
  drop.addEventListener('dragleave', e => { e.preventDefault(); drop.classList.remove('dragover'); });
  drop.addEventListener('drop', e => {
    e.preventDefault(); drop.classList.remove('dragover');
    if (e.dataTransfer && e.dataTransfer.files) handleFiles(e.dataTransfer.files);
  });

  compressBtn.addEventListener('click', async () => {
    compressBtn.disabled = true;
    await compressAll();
    compressBtn.disabled = false;
  });

  clearBtn.addEventListener('click', () => clearConvertedList());
}

document.addEventListener('DOMContentLoaded', init);

export default { };
