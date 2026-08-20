// 3단계: 봉안당 크기 프리셋, 액자 방향(세로/가로) 선택, 배치 화면 반응형 배율
// - 봉안당 크기를 프리셋(일반단 25/27, 부부단, 직접입력)에서 선택
// - 액자 목록 클릭 시 배치 화면에 추가 (겹치지 않는 빈 자리에 자동 배치)
// - 2,4,6,8호는 세로/가로 방향을 드롭다운으로 선택 가능
// - 배치된 액자를 드래그로 이동 (다른 액자와 겹치면 원위치로 복귀)
// - 배치된 액자 삭제 / 모두 삭제
// - 오른쪽 사용 현황에 개수 반영
// - PNG로 저장

const MAX_STAGE_WIDTH_PX = 680; // 배치 화면의 기준 가로 폭(px) 최댓값 (PC 등 화면이 넓을 때)
const MIN_STAGE_WIDTH_PX = 260; // 화면이 아주 좁아도 최소한 이 정도 폭은 확보

// 모바일처럼 화면이 좁을 때는 배치 화면(stage-wrapper) 실제 폭에 맞춰 배율을 줄여서
// 가로 스크롤 없이도 봉안당 전체가 화면 안에 들어오게 합니다.
function getStageTargetWidthPx() {
  const wrapper = document.getElementById("stage-wrapper");
  const available = wrapper ? wrapper.clientWidth : MAX_STAGE_WIDTH_PX;
  if (!available) return MAX_STAGE_WIDTH_PX;
  return Math.min(MAX_STAGE_WIDTH_PX, Math.max(available - 4, MIN_STAGE_WIDTH_PX));
}

let TARGET_STAGE_WIDTH_PX = getStageTargetWidthPx();
let PX_PER_CM = TARGET_STAGE_WIDTH_PX / window.NICHE_CONFIG.defaultWidthCm;

const URN_WIDTH_CM = 15; // 유골함 크기(가로) - 봉안당 크기와 무관하게 항상 고정
const URN_HEIGHT_CM = 17; // 유골함 크기(세로)
const URN_BOTTOM_MARGIN_CM = 1; // 유골함과 봉안당 바닥 사이 여백
const URN_GAP_CM = 2; // 유골함이 2개(부부단)일 때 유골함 사이 간격

const NICHE_TRIM_CM = 1; // 봉안당 나무 액자틀(테두리) 두께
const NICHE_TRIM_FILL = "#e3d9c6";
const NICHE_TRIM_STROKE = "#cca675";

const state = {
  nicheWidthCm: window.NICHE_CONFIG.defaultWidthCm,
  nicheHeightCm: window.NICHE_CONFIG.defaultHeightCm,
  urnCount: 1,
  placedFrames: [] // { uid, frameId, xCm, yCm, orientation: "portrait" | "landscape", imageDataUrl? }
};

let nextUid = 1;

const nichePresetListEl = document.getElementById("niche-preset-list");
const customSizeInputsEl = document.getElementById("custom-size-inputs");
const inputWidth = document.getElementById("input-width");
const inputHeight = document.getElementById("input-height");
const btnApplySize = document.getElementById("btn-apply-size");
const stageFrameEl = document.getElementById("stage-frame");
const stageEl = document.getElementById("stage");
const frameListEl = document.getElementById("frame-list");
const usageListEl = document.getElementById("usage-list");
const usageHintEl = document.getElementById("usage-hint");
const btnSavePng = document.getElementById("btn-save-png");
const btnClearAll = document.getElementById("btn-clear-all");

// 배치 화면은 항상 봉안당 "가로" 크기 기준으로 화면 폭이 정해지고, 세로는 그 배율을 따라갑니다.
// 실제로 화면에 그려지는 상자는 봉안당 내부 폭에 나무 테두리(trim, 좌우 합쳐 2×NICHE_TRIM_CM)가
// 더해진 크기이므로, 그 합계가 사용 가능한 폭 안에 들어오도록 배율을 계산합니다.
// (테두리를 빼놓고 계산하면 실제 박스가 목표 폭보다 커져서 모바일 화면에서 가로 스크롤이 생깁니다.)
function updatePxPerCm() {
  TARGET_STAGE_WIDTH_PX = getStageTargetWidthPx();
  PX_PER_CM = TARGET_STAGE_WIDTH_PX / (state.nicheWidthCm + NICHE_TRIM_CM * 2);
}

// outer(겉면) + inner(안쪽) 도형을 합친 전체 마크업 (사진이 없을 때 채워서 그리는 용도)
function shapeFullMarkup(shape) {
  return shape.outer + shape.inner;
}

// shape.inner(안쪽 도형)가 최종적으로(세로/가로 방향에 따라) 액자의 "자연(세로) 크기" 박스 안
// 어느 위치/크기(px)에 나타나는지, 그리고 shape.inner 원본 좌표를 그 자리로 그대로 옮기는 변환행렬을 계산합니다.
// (회전을 두 번 상쇄시키는 방식은 SVG의 가로/세로 배율이 완전히 같지 않을 때 오차가 커져서,
//  최종 위치를 한 번에 직접 계산하는 방식으로 구현했습니다.)
function computeInnerPhotoGeometry(shape, frame, isLandscape) {
  const [vbX, vbY, vbW, vbH] = shape.viewBox.split(" ").map(Number);
  const naturalWpx = frame.widthCm * PX_PER_CM;
  const naturalHpx = frame.heightCm * PX_PER_CM;
  const scaleX = naturalWpx / vbW;
  const scaleY = naturalHpx / vbH;
  const ib = shape.innerBBox;

  const natPxX = (ib.x - vbX) * scaleX;
  const natPxY = (ib.y - vbY) * scaleY;
  const natPxW = ib.w * scaleX;
  const natPxH = ib.h * scaleY;

  if (isLandscape) {
    // 세로 기준 자연 좌표 (natX,natY)가 90도 회전 후 (naturalHpx-natY, natX) 로 옮겨간다는 점을 이용
    const effX = naturalHpx - natPxY - natPxH;
    const effY = natPxX;
    const effW = natPxH;
    const effH = natPxW;
    // (vx,vy) -> (naturalHpx - (vy-vbY)*scaleY - effX, (vx-vbX)*scaleX - effY)
    const matrix = [0, scaleX, -scaleY, 0, scaleY * vbY + naturalHpx - effX, -scaleX * vbX - effY];
    return { effX, effY, effW, effH, matrix };
  }

  const effX = natPxX;
  const effY = natPxY;
  const effW = natPxW;
  const effH = natPxH;
  const matrix = [scaleX, 0, 0, scaleY, -ib.x * scaleX, -ib.y * scaleY];
  return { effX, effY, effW, effH, matrix };
}

// shape.inner 마크업의 각 요소에 matrix 변환을 직접 적용해서 반환합니다.
// (주의: <clipPath> 안에서는 <g transform="...">로 감싸는 방식이 일부 브라우저에서 무시되는 문제가 있어서,
//  반드시 도형 요소 자신의 transform 속성에 직접 붙여야 합니다. 기존에 transform이 있으면 뒤에 이어붙입니다.)
function applyMatrixToMarkup(markup, matrix) {
  const matrixStr = `matrix(${matrix.join(" ")})`;
  const doc = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`,
    "image/svg+xml"
  );
  return Array.from(doc.documentElement.children)
    .map((node) => {
      const existing = node.getAttribute("transform");
      node.setAttribute("transform", existing ? `${matrixStr} ${existing}` : matrixStr);
      return node.outerHTML;
    })
    .join("");
}

// orientation이 "landscape"면 가로/세로를 서로 바꾼 실제 배치 크기를 반환
function getEffectiveDims(frame, orientation) {
  if (orientation === "landscape") {
    return { widthCm: frame.heightCm, heightCm: frame.widthCm };
  }
  return { widthCm: frame.widthCm, heightCm: frame.heightCm };
}

// 나무 액자틀처럼 겉테두리(트림)와 안쪽 사각형을 45도 마이터 선으로 잇는 배경을 그림
// (target이 DOM svg 문자열이면 el.innerHTML에, ctx면 캔버스에 바로 그립니다)
function buildNicheFrameSvg(innerW, innerH, t) {
  const totalW = innerW + t * 2;
  const totalH = innerH + t * 2;
  const poly = (pts) => `<polygon points="${pts.map((p) => p.join(",")).join(" ")}" fill="${NICHE_TRIM_FILL}" stroke="${NICHE_TRIM_STROKE}" stroke-width="1"/>`;
  return (
    `<svg width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}">` +
    poly([[0, 0], [totalW, 0], [totalW - t, t], [t, t]]) +
    poly([[totalW, 0], [totalW, totalH], [totalW - t, totalH - t], [totalW - t, t]]) +
    poly([[totalW, totalH], [0, totalH], [t, totalH - t], [totalW - t, totalH - t]]) +
    poly([[0, totalH], [0, 0], [t, t], [t, totalH - t]]) +
    `<rect x="${t}" y="${t}" width="${innerW}" height="${innerH}" fill="none" stroke="${NICHE_TRIM_STROKE}" stroke-width="1"/>` +
    `<rect x="0.5" y="0.5" width="${totalW - 1}" height="${totalH - 1}" fill="none" stroke="${NICHE_TRIM_STROKE}" stroke-width="1"/>` +
    `</svg>`
  );
}

function drawNicheFrameToCanvas(ctx, innerW, innerH, t) {
  const totalW = innerW + t * 2;
  const totalH = innerH + t * 2;
  const polys = [
    [[0, 0], [totalW, 0], [totalW - t, t], [t, t]],
    [[totalW, 0], [totalW, totalH], [totalW - t, totalH - t], [totalW - t, t]],
    [[totalW, totalH], [0, totalH], [t, totalH - t], [totalW - t, totalH - t]],
    [[0, totalH], [0, 0], [t, t], [t, totalH - t]]
  ];
  ctx.fillStyle = NICHE_TRIM_FILL;
  ctx.strokeStyle = NICHE_TRIM_STROKE;
  ctx.lineWidth = 1;
  polys.forEach((pts) => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  });
  ctx.strokeRect(t, t, innerW, innerH);
  ctx.strokeRect(0.5, 0.5, totalW - 1, totalH - 1);
}

function renderStageSize() {
  const innerW = state.nicheWidthCm * PX_PER_CM;
  const innerH = state.nicheHeightCm * PX_PER_CM;
  const trimPx = NICHE_TRIM_CM * PX_PER_CM;

  stageEl.style.width = innerW + "px";
  stageEl.style.height = innerH + "px";
  stageEl.style.left = trimPx + "px";
  stageEl.style.top = trimPx + "px";

  stageFrameEl.style.width = innerW + trimPx * 2 + "px";
  stageFrameEl.style.height = innerH + trimPx * 2 + "px";

  let trimEl = stageFrameEl.querySelector(".stage-frame-trim");
  if (!trimEl) {
    trimEl = document.createElement("div");
    trimEl.className = "stage-frame-trim";
    stageFrameEl.insertBefore(trimEl, stageFrameEl.firstChild);
  }
  trimEl.innerHTML = buildNicheFrameSvg(innerW, innerH, trimPx);
}

function renderNichePresetList() {
  nichePresetListEl.innerHTML = "";
  window.NICHE_PRESETS.forEach((preset, index) => {
    const li = document.createElement("li");
    const label = document.createElement("label");

    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "niche-preset";
    radio.value = preset.id;
    if (index === 0) radio.checked = true;
    radio.addEventListener("change", () => {
      if (preset.id === "custom") {
        customSizeInputsEl.style.display = "";
      } else {
        customSizeInputsEl.style.display = "none";
        inputWidth.value = preset.widthCm;
        inputHeight.value = preset.heightCm;
      }
    });

    label.appendChild(radio);
    label.appendChild(document.createTextNode(" " + preset.label));
    li.appendChild(label);
    nichePresetListEl.appendChild(li);
  });
}

function getSelectedPreset() {
  const checked = document.querySelector('input[name="niche-preset"]:checked');
  return window.NICHE_PRESETS.find((p) => p.id === (checked ? checked.value : null));
}

function renderFrameList() {
  frameListEl.innerHTML = "";
  window.FRAME_DATA.forEach((frame) => {
    const li = document.createElement("li");

    const left = document.createElement("span");
    left.className = "frame-list-left";

    const shape = window.FRAME_SHAPES[frame.id];
    if (shape) {
      const iconWrap = document.createElement("span");
      iconWrap.className = "frame-list-icon";
      iconWrap.innerHTML = `<svg viewBox="${shape.viewBox}" preserveAspectRatio="xMidYMid meet" fill="#fff8e6" stroke="#412517" stroke-width="2">${shapeFullMarkup(shape)}</svg>`;
      left.appendChild(iconWrap);
    }

    const name = document.createElement("span");
    name.textContent = frame.name;
    left.appendChild(name);

    const right = document.createElement("span");
    right.className = "frame-list-right";

    let orientationSelect = null;
    if (frame.orientable) {
      orientationSelect = document.createElement("select");
      orientationSelect.className = "frame-orientation-select";
      orientationSelect.innerHTML = '<option value="portrait">세로</option><option value="landscape">가로</option>';
      orientationSelect.addEventListener("click", (e) => e.stopPropagation());
      orientationSelect.addEventListener("pointerdown", (e) => e.stopPropagation());
      right.appendChild(orientationSelect);
    }

    const size = document.createElement("span");
    size.style.color = "#888";
    size.textContent = `${frame.widthCm}×${frame.heightCm}cm`;
    right.appendChild(size);

    li.appendChild(left);
    li.appendChild(right);
    li.addEventListener("click", () => {
      const orientation = orientationSelect ? orientationSelect.value : "portrait";
      addFrame(frame.id, orientation);
    });
    frameListEl.appendChild(li);
  });
}

function rectsOverlap(a, b) {
  return a.xCm < b.xCm + b.widthCm &&
    a.xCm + a.widthCm > b.xCm &&
    a.yCm < b.yCm + b.heightCm &&
    a.yCm + a.heightCm > b.yCm;
}

function hasCollision(rect, excludeUid) {
  return state.placedFrames.some((placed) => {
    if (placed.uid === excludeUid) return false;
    const frame = window.FRAME_DATA.find((f) => f.id === placed.frameId);
    const dims = getEffectiveDims(frame, placed.orientation);
    const other = { xCm: placed.xCm, yCm: placed.yCm, widthCm: dims.widthCm, heightCm: dims.heightCm };
    return rectsOverlap(rect, other);
  });
}

// 봉안당 안에서 다른 액자와 겹치지 않는 빈 자리를 찾음 (없으면 null)
function findFreePosition(widthCm, heightCm) {
  const stepCm = 0.5;
  const maxX = state.nicheWidthCm - widthCm;
  const maxY = state.nicheHeightCm - heightCm;
  if (maxX < 0 || maxY < 0) return null;

  for (let y = 0; y <= maxY + 1e-9; y += stepCm) {
    for (let x = 0; x <= maxX + 1e-9; x += stepCm) {
      const candidate = { xCm: x, yCm: y, widthCm, heightCm };
      if (!hasCollision(candidate, null)) {
        return { xCm: x, yCm: y };
      }
    }
  }
  return null;
}

function addFrame(frameId, orientation) {
  const frame = window.FRAME_DATA.find((f) => f.id === frameId);
  if (!frame) return;

  const dims = getEffectiveDims(frame, orientation);

  if (dims.widthCm > state.nicheWidthCm || dims.heightCm > state.nicheHeightCm) {
    alert(`${frame.name}은(는) 봉안당 크기보다 커서 배치할 수 없습니다.`);
    return;
  }

  const pos = findFreePosition(dims.widthCm, dims.heightCm);
  if (!pos) {
    alert("겹치지 않게 배치할 수 있는 빈 자리가 없습니다.");
    return;
  }

  state.placedFrames.push({
    uid: nextUid++,
    frameId: frame.id,
    xCm: pos.xCm,
    yCm: pos.yCm,
    orientation: orientation === "landscape" ? "landscape" : "portrait"
  });

  renderPlacedFrames();
  renderUsageList();
}

function removeFrame(uid) {
  state.placedFrames = state.placedFrames.filter((f) => f.uid !== uid);
  renderPlacedFrames();
  renderUsageList();
}

function clearAllFrames() {
  state.placedFrames = [];
  renderPlacedFrames();
  renderUsageList();
}

// 봉안당이 유골함(15x17cm)보다 작을 수도 있으니 그 경우엔 봉안당 크기에 맞춰 축소
function getUrnBoxDims() {
  return {
    widthCm: Math.min(URN_WIDTH_CM, state.nicheWidthCm),
    heightCm: Math.min(URN_HEIGHT_CM, state.nicheHeightCm)
  };
}

// 유골함 1개 또는 2개(부부단)가 봉안당 안에서 놓일 x,y(cm) 좌표를 계산
function getUrnPositions() {
  const count = Math.max(1, state.urnCount || 1);
  const urnDims = getUrnBoxDims();
  const totalWidthCm = count * urnDims.widthCm + (count - 1) * URN_GAP_CM;
  const startXCm = Math.max(0, (state.nicheWidthCm - totalWidthCm) / 2);
  const bottomMarginCm = Math.max(0, Math.min(URN_BOTTOM_MARGIN_CM, state.nicheHeightCm - urnDims.heightCm));
  const yCm = state.nicheHeightCm - urnDims.heightCm - bottomMarginCm;

  const positions = [];
  for (let i = 0; i < count; i++) {
    positions.push({ xCm: startXCm + i * (urnDims.widthCm + URN_GAP_CM), yCm });
  }
  return positions;
}

function renderUrnBackground() {
  const urnDims = getUrnBoxDims();
  getUrnPositions().forEach((pos) => {
    const urnWrap = document.createElement("div");
    urnWrap.className = "stage-urn";
    urnWrap.style.width = urnDims.widthCm * PX_PER_CM + "px";
    urnWrap.style.height = urnDims.heightCm * PX_PER_CM + "px";
    urnWrap.style.left = pos.xCm * PX_PER_CM + "px";
    urnWrap.style.top = pos.yCm * PX_PER_CM + "px";
    urnWrap.innerHTML = `<svg viewBox="${window.URN_SHAPE.viewBox}" preserveAspectRatio="xMidYMid meet" fill="#fff" stroke="#9c8a7a" stroke-width="2">${window.URN_SHAPE.markup}</svg>`;
    stageEl.appendChild(urnWrap);
  });
}

function renderPlacedFrames() {
  stageEl.innerHTML = "";
  renderUrnBackground();

  state.placedFrames.forEach((placed) => {
    const frame = window.FRAME_DATA.find((f) => f.id === placed.frameId);
    if (!frame) return;

    const dims = getEffectiveDims(frame, placed.orientation);

    const el = document.createElement("div");
    el.className = "placed-frame";
    el.style.width = dims.widthCm * PX_PER_CM + "px";
    el.style.height = dims.heightCm * PX_PER_CM + "px";
    el.style.left = placed.xCm * PX_PER_CM + "px";
    el.style.top = placed.yCm * PX_PER_CM + "px";
    el.dataset.uid = String(placed.uid);

    const shape = window.FRAME_SHAPES[frame.id];
    if (shape) {
      const svgWrap = document.createElement("div");
      svgWrap.className = "placed-frame-svg";
      // 도형은 항상 "세로" 기준 원본 크기로 그리고, 가로 방향이면 90도 회전시켜 배치합니다.
      svgWrap.style.width = frame.widthCm * PX_PER_CM + "px";
      svgWrap.style.height = frame.heightCm * PX_PER_CM + "px";
      if (placed.orientation === "landscape") {
        svgWrap.style.transformOrigin = "top left";
        svgWrap.style.transform = "rotate(90deg) translateY(-100%)";
      }

      const isLandscape = placed.orientation === "landscape";

      if (placed.imageDataUrl && placed.imageNaturalW) {
        // 겉면(outer)+안쪽 테두리선은 기존과 동일하게(회전 포함) 그리고, 사진은 없이 둡니다.
        svgWrap.innerHTML =
          `<svg viewBox="${shape.viewBox}" preserveAspectRatio="none">` +
          `<g fill="#fff8e6" stroke="#412517" stroke-width="2">${shape.outer}</g>` +
          `<g fill="none" stroke="#412517" stroke-width="2">${shape.inner}</g>` +
          `</svg>`;
        el.appendChild(svgWrap);

        // 사진은 회전시키지 않고 최종 위치/크기를 직접 계산해서 별도 레이어로 겹쳐 놓습니다
        // (안쪽 도형은 계산된 변환행렬로 그 자리에 맞춰 그려서 클리핑 모양만 가져옵니다).
        const geo = computeInnerPhotoGeometry(shape, frame, isLandscape);
        const clipId = `frame-clip-${placed.uid}`;

        const photoWrap = document.createElement("div");
        photoWrap.className = "placed-frame-photo";
        photoWrap.style.left = geo.effX + "px";
        photoWrap.style.top = geo.effY + "px";
        photoWrap.style.width = geo.effW + "px";
        photoWrap.style.height = geo.effH + "px";
        photoWrap.innerHTML =
          `<svg width="${geo.effW}" height="${geo.effH}" viewBox="0 0 ${geo.effW} ${geo.effH}">` +
          `<defs><clipPath id="${clipId}">${applyMatrixToMarkup(shape.inner, geo.matrix)}</clipPath></defs>` +
          `<image href="${placed.imageDataUrl}" x="0" y="0" width="${geo.effW}" height="${geo.effH}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})"/>` +
          `</svg>`;
        el.appendChild(photoWrap);
      } else {
        svgWrap.innerHTML = `<svg viewBox="${shape.viewBox}" preserveAspectRatio="none" fill="#fff8e6" stroke="#412517" stroke-width="2">${shapeFullMarkup(shape)}</svg>`;
        el.appendChild(svgWrap);
      }
    }

    const label = document.createElement("span");
    label.className = "placed-frame-label";
    label.textContent = frame.name;
    el.appendChild(label);

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.className = "placed-frame-file-input";
    fileInput.addEventListener("click", (e) => e.stopPropagation());
    fileInput.addEventListener("pointerdown", (e) => e.stopPropagation());
    fileInput.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result;
        // cover 크기를 직접 계산하려면 사진의 원본 가로/세로 픽셀 크기가 필요해서 먼저 로드해둠
        const img = new Image();
        img.onload = () => {
          placed.imageDataUrl = dataUrl;
          placed.imageNaturalW = img.naturalWidth;
          placed.imageNaturalH = img.naturalHeight;
          renderPlacedFrames();
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    });
    el.appendChild(fileInput);

    const uploadBtn = document.createElement("button");
    uploadBtn.className = "placed-frame-upload";
    uploadBtn.textContent = "📷";
    uploadBtn.title = placed.imageDataUrl ? "사진 바꾸기" : "사진 넣기";
    uploadBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
    uploadBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      fileInput.click();
    });
    el.appendChild(uploadBtn);

    const removeBtn = document.createElement("button");
    removeBtn.className = "placed-frame-remove";
    removeBtn.textContent = "×";
    removeBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      removeFrame(placed.uid);
    });
    el.appendChild(removeBtn);

    el.addEventListener("pointerdown", (e) => startDrag(e, el, dims, placed));

    stageEl.appendChild(el);
  });
}

function startDrag(e, el, dims, placed) {
  e.preventDefault();
  el.setPointerCapture(e.pointerId);
  el.classList.add("dragging");

  const stageRect = stageEl.getBoundingClientRect();
  const frameWidthPx = dims.widthCm * PX_PER_CM;
  const frameHeightPx = dims.heightCm * PX_PER_CM;
  const elRect = el.getBoundingClientRect();
  const offsetX = e.clientX - elRect.left;
  const offsetY = e.clientY - elRect.top;
  const startXCm = placed.xCm;
  const startYCm = placed.yCm;

  function onMove(ev) {
    let left = ev.clientX - stageRect.left - offsetX;
    let top = ev.clientY - stageRect.top - offsetY;
    left = Math.min(Math.max(left, 0), stageRect.width - frameWidthPx);
    top = Math.min(Math.max(top, 0), stageRect.height - frameHeightPx);
    el.style.left = left + "px";
    el.style.top = top + "px";

    const candidate = {
      xCm: left / PX_PER_CM,
      yCm: top / PX_PER_CM,
      widthCm: dims.widthCm,
      heightCm: dims.heightCm
    };
    el.classList.toggle("collision", hasCollision(candidate, placed.uid));
  }

  function onUp(ev) {
    el.releasePointerCapture(ev.pointerId);
    el.classList.remove("dragging");
    el.removeEventListener("pointermove", onMove);
    el.removeEventListener("pointerup", onUp);

    const candidate = {
      xCm: parseFloat(el.style.left) / PX_PER_CM,
      yCm: parseFloat(el.style.top) / PX_PER_CM,
      widthCm: dims.widthCm,
      heightCm: dims.heightCm
    };

    if (hasCollision(candidate, placed.uid)) {
      // 다른 액자와 겹치면 원래 위치로 되돌림
      el.classList.remove("collision");
      el.style.left = startXCm * PX_PER_CM + "px";
      el.style.top = startYCm * PX_PER_CM + "px";
    } else {
      placed.xCm = candidate.xCm;
      placed.yCm = candidate.yCm;
    }
  }

  el.addEventListener("pointermove", onMove);
  el.addEventListener("pointerup", onUp);
}

function renderUsageList() {
  usageListEl.innerHTML = "";

  if (state.placedFrames.length === 0) {
    usageHintEl.style.display = "";
    btnClearAll.style.display = "none";
    return;
  }
  usageHintEl.style.display = "none";
  btnClearAll.style.display = "";

  const counts = {};
  state.placedFrames.forEach((f) => {
    counts[f.frameId] = (counts[f.frameId] || 0) + 1;
  });

  Object.keys(counts).forEach((frameId) => {
    const frame = window.FRAME_DATA.find((f) => f.id === frameId);
    const li = document.createElement("li");
    li.textContent = `${frame.name} × ${counts[frameId]}개`;
    usageListEl.appendChild(li);
  });

  const totalLi = document.createElement("li");
  totalLi.className = "usage-total";
  totalLi.textContent = `총 ${state.placedFrames.length}개`;
  usageListEl.appendChild(totalLi);
}

// transform="translate(a b) rotate(c)" 형태만 파싱 (도형 데이터에서 쓰는 범위)
function parseTranslateRotate(transformStr) {
  if (!transformStr) return null;
  const translateMatch = transformStr.match(/translate\(([-\d.]+)[ ,]+([-\d.]+)\)/);
  const rotateMatch = transformStr.match(/rotate\(([-\d.]+)\)/);
  if (!translateMatch && !rotateMatch) return null;
  return {
    tx: translateMatch ? parseFloat(translateMatch[1]) : 0,
    ty: translateMatch ? parseFloat(translateMatch[2]) : 0,
    rotateDeg: rotateMatch ? parseFloat(rotateMatch[1]) : 0
  };
}

// shape.markup 안의 path/rect 각각을 Path2D로 만들어 콜백에 넘겨줌 (transform 있으면 같이 전달)
function forEachShapeNode(shape, callback) {
  const doc = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg">${shape.markup}</svg>`,
    "image/svg+xml"
  );

  Array.from(doc.documentElement.children).forEach((node) => {
    let path = null;
    if (node.tagName === "path") {
      path = new Path2D(node.getAttribute("d"));
    } else if (node.tagName === "rect") {
      const rx = parseFloat(node.getAttribute("x"));
      const ry = parseFloat(node.getAttribute("y"));
      const rw = parseFloat(node.getAttribute("width"));
      const rh = parseFloat(node.getAttribute("height"));
      const radius = parseFloat(node.getAttribute("rx")) || 0;
      path = new Path2D();
      if (radius > 0 && path.roundRect) {
        path.roundRect(rx, ry, rw, rh, radius);
      } else {
        path.rect(rx, ry, rw, rh);
      }
    }
    if (path) {
      callback(path, parseTranslateRotate(node.getAttribute("transform")));
    }
  });
}

// 액자/유골함 도형(shape.viewBox + shape.markup)을 캔버스의 (boxX,boxY,boxW,boxH) 영역에 그림
// fit:"none" = 박스에 꽉 채우도록 늘림 (액자), fit:"meet" = 비율 유지하며 안쪽에 맞춤 (유골함)
function drawShapeToCanvas(ctx, shape, boxX, boxY, boxW, boxH, options) {
  const fill = options.fill;
  const stroke = options.stroke;
  const lineWidth = options.lineWidth;
  const fit = options.fit;

  const [vbX, vbY, vbW, vbH] = shape.viewBox.split(" ").map(Number);

  let scaleX, scaleY, offsetX = 0, offsetY = 0;
  if (fit === "meet") {
    const s = Math.min(boxW / vbW, boxH / vbH);
    scaleX = s;
    scaleY = s;
    offsetX = (boxW - vbW * s) / 2;
    offsetY = (boxH - vbH * s) / 2;
  } else {
    scaleX = boxW / vbW;
    scaleY = boxH / vbH;
  }

  ctx.save();
  ctx.translate(boxX + offsetX, boxY + offsetY);
  ctx.scale(scaleX, scaleY);
  ctx.translate(-vbX, -vbY);
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;

  forEachShapeNode(shape, (path, t) => {
    if (t) {
      ctx.save();
      ctx.translate(t.tx, t.ty);
      ctx.rotate((t.rotateDeg * Math.PI) / 180);
    }
    ctx.fill(path);
    ctx.stroke(path);
    if (t) {
      ctx.restore();
    }
  });

  ctx.restore();
}

// (bx,by,bw,bh) 영역에 이미지를 cover(꽉 채우기) 방식으로 그림
function drawCoverImage(ctx, img, bx, by, bw, bh) {
  const imgAspect = img.naturalWidth / img.naturalHeight;
  const boxAspect = bw / bh;
  let drawW, drawH, drawX, drawY;
  if (imgAspect > boxAspect) {
    drawH = bh;
    drawW = bh * imgAspect;
    drawX = bx - (drawW - bw) / 2;
    drawY = by;
  } else {
    drawW = bw;
    drawH = bw / imgAspect;
    drawX = bx;
    drawY = by - (drawH - bh) / 2;
  }
  ctx.drawImage(img, drawX, drawY, drawW, drawH);
}

// 액자 하나(테두리 + 있으면 사진)를 캔버스의 (x,y) 위치(자연=세로 기준 폭/높이 박스가 기준)에 그림.
// 테두리는 기존처럼 회전 컨텍스트 안에서 그리고, 사진은 회전을 상쇄하는 대신 최종 위치를
// computeInnerPhotoGeometry로 한 번에 계산해서 회전 없이 직접 그립니다.
function drawFrameToCanvas(ctx, shape, frame, x, y, isLandscape, options) {
  const fillColor = options.fillColor;
  const strokeColor = options.strokeColor;
  const lineWidth = options.lineWidth;
  const img = options.img;

  const naturalW = frame.widthCm * PX_PER_CM;
  const naturalH = frame.heightCm * PX_PER_CM;

  const drawBorderAt = (bx, by) => {
    if (img) {
      drawShapeToCanvas(ctx, { viewBox: shape.viewBox, markup: shape.outer }, bx, by, naturalW, naturalH, {
        fill: fillColor,
        stroke: strokeColor,
        lineWidth,
        fit: "none"
      });
      drawShapeToCanvas(ctx, { viewBox: shape.viewBox, markup: shape.inner }, bx, by, naturalW, naturalH, {
        fill: "none",
        stroke: strokeColor,
        lineWidth,
        fit: "none"
      });
    } else {
      drawShapeToCanvas(ctx, { viewBox: shape.viewBox, markup: shapeFullMarkup(shape) }, bx, by, naturalW, naturalH, {
        fill: fillColor,
        stroke: strokeColor,
        lineWidth,
        fit: "none"
      });
    }
  };

  if (isLandscape) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 2);
    ctx.translate(0, -naturalH);
    drawBorderAt(0, 0);
    ctx.restore();
  } else {
    drawBorderAt(x, y);
  }

  if (!img) return;

  const geo = computeInnerPhotoGeometry(shape, frame, isLandscape);
  const geoMatrix = new DOMMatrix(geo.matrix);
  const clipPath = new Path2D();
  forEachShapeNode({ markup: shape.inner }, (path, t) => {
    const m = t ? geoMatrix.multiply(new DOMMatrix().translate(t.tx, t.ty).rotate(t.rotateDeg)) : geoMatrix;
    const transformed = new Path2D();
    transformed.addPath(path, m);
    clipPath.addPath(transformed);
  });

  ctx.save();
  ctx.translate(x, y);
  // clipPath는 (effX,effY) 위치를 (0,0)으로 하는 로컬 좌표로 계산되어 있으므로
  // (화면 미리보기의 중첩 SVG와 동일한 좌표계), 캔버스에서도 그만큼 원점을 옮겨줘야
  // 클리핑 영역과 실제로 그리는 사진 위치가 일치합니다.
  ctx.translate(geo.effX, geo.effY);
  ctx.clip(clipPath);
  drawCoverImage(ctx, img, 0, 0, geo.effW, geo.effH);
  ctx.restore();
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function saveAsPng() {
  // 사진이 들어간 액자들의 이미지를 먼저 모두 불러옴
  const imageCache = {};
  await Promise.all(
    state.placedFrames
      .filter((p) => p.imageDataUrl)
      .map((p) =>
        loadImage(p.imageDataUrl).then((img) => {
          if (img) imageCache[p.uid] = img;
        })
      )
  );

  const scale = 4; // 고해상도 저장을 위한 배율
  const trimPx = NICHE_TRIM_CM * PX_PER_CM;
  const widthPx = state.nicheWidthCm * PX_PER_CM;
  const heightPx = state.nicheHeightCm * PX_PER_CM;
  const totalWidthPx = widthPx + trimPx * 2;
  const totalHeightPx = heightPx + trimPx * 2;

  const canvas = document.createElement("canvas");
  canvas.width = totalWidthPx * scale;
  canvas.height = totalHeightPx * scale;

  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, totalWidthPx, totalHeightPx);
  drawNicheFrameToCanvas(ctx, widthPx, heightPx, trimPx);

  // 이 아래부터는 나무틀 안쪽(봉안당 내부) 기준 좌표로 그림
  ctx.save();
  ctx.translate(trimPx, trimPx);

  ctx.fillStyle = "#fafafa";
  ctx.fillRect(0, 0, widthPx, heightPx);

  // 유골함 (배치 화면과 동일하게 15×17cm 고정 크기, 부부단은 2개로 하단 중앙에 배경으로 표시)
  const urnDims = getUrnBoxDims();
  const urnBoxW = urnDims.widthCm * PX_PER_CM;
  const urnBoxH = urnDims.heightCm * PX_PER_CM;
  getUrnPositions().forEach((pos) => {
    ctx.save();
    ctx.globalAlpha = 0.5;
    drawShapeToCanvas(ctx, window.URN_SHAPE, pos.xCm * PX_PER_CM, pos.yCm * PX_PER_CM, urnBoxW, urnBoxH, {
      fill: "#fff",
      stroke: "#9c8a7a",
      lineWidth: 2,
      fit: "meet"
    });
    ctx.restore();
  });

  state.placedFrames.forEach((placed) => {
    const frame = window.FRAME_DATA.find((f) => f.id === placed.frameId);
    if (!frame) return;
    const dims = getEffectiveDims(frame, placed.orientation);
    const x = placed.xCm * PX_PER_CM;
    const y = placed.yCm * PX_PER_CM;
    const w = dims.widthCm * PX_PER_CM;
    const h = dims.heightCm * PX_PER_CM;

    const shape = window.FRAME_SHAPES[frame.id];
    if (shape) {
      const img = imageCache[placed.uid];
      drawFrameToCanvas(ctx, shape, frame, x, y, placed.orientation === "landscape", {
        img,
        fillColor: "#fff8e6",
        strokeColor: "#412517",
        lineWidth: 2
      });
    }

    // 라벨 글씨: 사진 위에서도 잘 보이도록 흰색 테두리(stroke)를 먼저 그리고 그 위에 글자를 채웁니다
    // (화면의 CSS text-shadow 효과를 캔버스에서는 strokeText로 대신 구현).
    ctx.font = "bold 13.2px 'Malgun Gothic', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#fff";
    ctx.strokeText(frame.name, x + w / 2, y + h / 2);
    ctx.fillStyle = "#333";
    ctx.fillText(frame.name, x + w / 2, y + h / 2);
  });

  ctx.restore();

  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const a = document.createElement("a");
    a.href = url;
    a.download = `납골당배치_${stamp}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });
}

function init() {
  renderNichePresetList();
  updatePxPerCm();

  inputWidth.value = state.nicheWidthCm;
  inputHeight.value = state.nicheHeightCm;

  renderStageSize();
  renderFrameList();
  renderPlacedFrames();
  renderUsageList();
}

btnApplySize.addEventListener("click", () => {
  const preset = getSelectedPreset();
  let w, h;

  if (preset && preset.id !== "custom") {
    w = preset.widthCm;
    h = preset.heightCm;
  } else {
    w = Number(inputWidth.value);
    h = Number(inputHeight.value);
  }

  if (!(w > 0) || !(h > 0)) {
    alert("올바른 봉안당 크기를 입력해주세요.");
    return;
  }

  state.nicheWidthCm = w;
  state.nicheHeightCm = h;
  state.urnCount = (preset && preset.urnCount) || 1;
  updatePxPerCm();

  // 봉안당 크기가 줄어들면 기존에 배치된 액자가 밖으로 나가지 않도록 위치 보정
  state.placedFrames.forEach((placed) => {
    const frame = window.FRAME_DATA.find((f) => f.id === placed.frameId);
    const dims = getEffectiveDims(frame, placed.orientation);
    const maxX = Math.max(0, state.nicheWidthCm - dims.widthCm);
    const maxY = Math.max(0, state.nicheHeightCm - dims.heightCm);
    placed.xCm = Math.min(placed.xCm, maxX);
    placed.yCm = Math.min(placed.yCm, maxY);
  });

  renderStageSize();
  renderPlacedFrames();
});

btnSavePng.addEventListener("click", saveAsPng);

btnClearAll.addEventListener("click", () => {
  if (state.placedFrames.length === 0) return;
  if (confirm("배치된 액자를 모두 삭제할까요?")) {
    clearAllFrames();
  }
});

// 창 크기 변경/모바일 화면 회전 시 배치 화면 배율을 다시 맞춤
let resizeTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const newTarget = getStageTargetWidthPx();
    if (Math.abs(newTarget - TARGET_STAGE_WIDTH_PX) > 2) {
      updatePxPerCm();
      renderStageSize();
      renderPlacedFrames();
    }
  }, 150);
});

init();
