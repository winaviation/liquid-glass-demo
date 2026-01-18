// Surface equations - define the height profile of the glass bezel
const SurfaceEquations = {
  convex_circle: (x) => Math.sqrt(1 - Math.pow(1 - x, 2)),
  convex_squircle: (x) => Math.pow(1 - Math.pow(1 - x, 4), 1 / 4),
  concave: (x) => 1 - Math.sqrt(1 - Math.pow(x, 2)),
  lip: (x) => {
    const convex = Math.pow(1 - Math.pow(1 - Math.min(x * 2, 1), 4), 1 / 4);
    const concave = 1 - Math.sqrt(1 - Math.pow(1 - x, 2)) + 0.1;
    const smootherstep =
      6 * Math.pow(x, 5) - 15 * Math.pow(x, 4) + 10 * Math.pow(x, 3);
    return convex * (1 - smootherstep) + concave * smootherstep;
  },
};

// Simple spring physics class
class Spring {
  constructor(value, stiffness = 300, damping = 20) {
    this.value = value;
    this.target = value;
    this.velocity = 0;
    this.stiffness = stiffness;
    this.damping = damping;
  }

  setTarget(target) {
    this.target = target;
  }

  update(dt) {
    const force = (this.target - this.value) * this.stiffness;
    const dampingForce = this.velocity * this.damping;
    this.velocity += (force - dampingForce) * dt;
    this.value += this.velocity * dt;
    return this.value;
  }

  isSettled() {
    return (
      Math.abs(this.target - this.value) < 0.001 &&
      Math.abs(this.velocity) < 0.001
    );
  }
}

// State
const state = {
  surfaceType: "convex_squircle",
  bezelWidth: 30,
  glassThickness: 150,
  refractiveIndex: 1.5,
  refractionScale: 1.5,
  specularOpacity: 1,
  blur: 0.5,
  objectWidth: 200,
  objectHeight: 140,
  radius: 70,
  maximumDisplacement: 0,
  isDragging: false,
  dragOffset: {
    x: 0,
    y: 0,
  },
  velocityX: 0,
  velocityY: 0,
  lastX: 0,
  lastY: 0,
  lastTime: 0,
};

// Animation springs
const springs = {
  scale: new Spring(0.85, 400, 25),
  scaleX: new Spring(1, 400, 30),
  scaleY: new Spring(1, 400, 30),
  shadowOffsetX: new Spring(0, 400, 30),
  shadowOffsetY: new Spring(4, 400, 30),
  shadowBlur: new Spring(12, 400, 30),
  shadowAlpha: new Spring(0.15, 300, 25),
  refractionBoost: new Spring(0.8, 300, 18),
};

let animationFrameId = null;

// DOM elements
const glassElement = document.getElementById("glassElement");
const glassInner = document.getElementById("glassInner");
const demoArea = document.getElementById("demoArea");
const demoContent = document.getElementById("demoContent");
const glassFilterSvg = document.getElementById("glassFilterSvg");
const glassContentClone = document.getElementById("glassContentClone");
const demoContentInner = document.getElementById("demoContentInner");
const displacementPreview = document.getElementById("displacementPreview");
const specularPreview = document.getElementById("specularPreview");

// Feature detection for backdrop-filter with SVG
let useBackdropFilter = false;
let backdropFilterSupported = false;

function detectBackdropFilterSupport() {
  // Check if browser supports backdrop-filter with SVG url()
  // This is currently only Chrome/Chromium
  const isChromium = !!window.chrome;
  const testEl = document.createElement("div");
  testEl.style.backdropFilter = "url(#test)";
  const supportsBackdropFilterUrl = testEl.style.backdropFilter.includes("url");

  backdropFilterSupported = isChromium && supportsBackdropFilterUrl;
  useBackdropFilter = backdropFilterSupported;

  // Update UI
  updateModeUI();

  if (useBackdropFilter) {
    glassElement.classList.add("use-backdrop-filter");
    console.log("Using native backdrop-filter (better performance)");
  } else {
    console.log("Using cloned content fallback (cross-browser)");
  }
}

function updateModeUI() {
  const modeToggle = document.getElementById("modeToggle");
  const modeValue = document.getElementById("modeValue");
  const modeUnsupported = document.getElementById("modeUnsupported");
  const browserNotice = document.getElementById("browserNotice");
  const noticeIcon = document.getElementById("noticeIcon");
  const noticeText = document.getElementById("noticeText");

  if (useBackdropFilter) {
    modeToggle.classList.add("active");
    modeValue.textContent = "Backdrop-filter";
  } else {
    modeToggle.classList.remove("active");
    modeValue.textContent = "Clone (Fallback)";
  }

  // Show warning if backdrop-filter not supported but toggle is on
  if (!backdropFilterSupported) {
    modeUnsupported.style.display = useBackdropFilter ? "inline" : "none";
  }

  // Show/hide mode notice for clone mode
  const modeNoticeRow = document.getElementById("modeNoticeRow");
  if (modeNoticeRow) {
    modeNoticeRow.style.display = useBackdropFilter ? "none" : "flex";
  }

  // Update browser notice dynamically
  if (useBackdropFilter) {
    if (backdropFilterSupported) {
      noticeIcon.textContent = "⚡";
      noticeText.innerHTML =
        "<strong>Using native backdrop-filter:</strong> " +
        "Your browser supports <code>backdrop-filter</code> with SVG filters. " +
        "This provides the best performance via GPU compositing.";
      browserNotice.style.background =
        "linear-gradient(135deg, rgba(72, 187, 120, 0.1), rgba(56, 161, 105, 0.1))";
      browserNotice.style.borderColor = "rgba(72, 187, 120, 0.3)";
    } else {
      noticeIcon.textContent = "⚠️";
      noticeText.innerHTML =
        "<strong>Backdrop-filter not supported:</strong> " +
        "Your browser doesn't support <code>backdrop-filter</code> with SVG filters. " +
        "The effect won't render correctly. Switch to Clone mode for proper display.";
      browserNotice.style.background =
        "linear-gradient(135deg, rgba(245, 101, 101, 0.1), rgba(229, 62, 62, 0.1))";
      browserNotice.style.borderColor = "rgba(245, 101, 101, 0.3)";
    }
  } else {
    noticeIcon.textContent = "✨";
    noticeText.innerHTML =
      "<strong>Cross-browser compatible:</strong> " +
      "This demo uses SVG filters with the regular <code>filter</code> property " +
      "instead of <code>backdrop-filter</code>, making it work in Firefox and Chrome. (Pardon me, Safari is broken for whatever reasons)";
    browserNotice.style.background =
      "linear-gradient(135deg, rgba(102, 126, 234, 0.1), rgba(118, 75, 162, 0.1))";
    browserNotice.style.borderColor = "rgba(102, 126, 234, 0.3)";
  }
}

function toggleRenderMode() {
  useBackdropFilter = !useBackdropFilter;

  if (useBackdropFilter) {
    glassElement.classList.add("use-backdrop-filter");
    // Clear the clone filter when using backdrop
    glassContentClone.style.filter = "none";
  } else {
    glassElement.classList.remove("use-backdrop-filter");
    // Re-apply filter to clone
    glassContentClone.style.filter = "url(#liquidGlassFilter)";
    updateContentClonePosition(true);
  }

  updateModeUI();
  console.log(
    useBackdropFilter
      ? "Switched to backdrop-filter mode"
      : "Switched to clone fallback mode",
  );
}

// Cached dimensions to avoid repeated getBoundingClientRect calls
let cachedAreaRect = null;
let lastAreaRectUpdate = 0;
const RECT_CACHE_DURATION = 100; // ms

function getAreaRect() {
  const now = performance.now();
  if (!cachedAreaRect || now - lastAreaRectUpdate > RECT_CACHE_DURATION) {
    cachedAreaRect = demoArea.getBoundingClientRect();
    lastAreaRectUpdate = now;
  }
  return cachedAreaRect;
}

// Throttle for position updates
let lastPositionUpdate = 0;
const POSITION_UPDATE_THROTTLE = 16; // ~60fps
let pendingPositionUpdate = false;

// Update the position of the cloned content inside the glass
function updateContentClonePosition(force = false) {
  // Skip if using backdrop-filter
  if (useBackdropFilter) return;

  const now = performance.now();
  if (!force && now - lastPositionUpdate < POSITION_UPDATE_THROTTLE) {
    // Schedule update for next frame if not already pending
    if (!pendingPositionUpdate) {
      pendingPositionUpdate = true;
      requestAnimationFrame(() => {
        pendingPositionUpdate = false;
        updateContentClonePosition(true);
      });
    }
    return;
  }
  lastPositionUpdate = now;

  const areaRect = getAreaRect();
  const glassLeft = parseFloat(glassElement.style.left) || 0;
  const glassTop = parseFloat(glassElement.style.top) || 0;

  // Use transform instead of left/top for better performance
  demoContentInner.style.width = areaRect.width + "px";
  demoContentInner.style.height = areaRect.height + "px";
  demoContentInner.style.transform = `translate(${-glassLeft}px, ${-glassTop}px)`;

  // Apply the SVG filter to the cloned content (only once)
  if (!glassContentClone.style.filter) {
    glassContentClone.style.filter = "url(#liquidGlassFilter)";
  }
}

// Invalidate rect cache on resize
window.addEventListener("resize", () => {
  cachedAreaRect = null;
  updateContentClonePosition(true);
});

// Calculate displacement along a single radius using Snell's Law
function calculateDisplacementMap1D(
  glassThickness,
  bezelWidth,
  surfaceFn,
  refractiveIndex,
  samples = 128,
) {
  const eta = 1 / refractiveIndex;

  function refract(normalX, normalY) {
    const dot = normalY;
    const k = 1 - eta * eta * (1 - dot * dot);
    if (k < 0) return null;
    const kSqrt = Math.sqrt(k);
    return [
      -(eta * dot + kSqrt) * normalX,
      eta - (eta * dot + kSqrt) * normalY,
    ];
  }

  const result = [];
  for (let i = 0; i < samples; i++) {
    const x = i / samples;
    const y = surfaceFn(x);
    const dx = x < 1 ? 0.0001 : -0.0001;
    const y2 = surfaceFn(Math.max(0, Math.min(1, x + dx)));
    const derivative = (y2 - y) / dx;
    const magnitude = Math.sqrt(derivative * derivative + 1);
    const normal = [-derivative / magnitude, -1 / magnitude];
    const refracted = refract(normal[0], normal[1]);

    if (!refracted) {
      result.push(0);
    } else {
      const remainingHeightOnBezel = y * bezelWidth;
      const remainingHeight = remainingHeightOnBezel + glassThickness;
      result.push(refracted[0] * (remainingHeight / refracted[1]));
    }
  }
  return result;
}

// Calculate 2D displacement map
function calculateDisplacementMap2D(
  canvasWidth,
  canvasHeight,
  objectWidth,
  objectHeight,
  radius,
  bezelWidth,
  maximumDisplacement,
  precomputedMap,
) {
  const imageData = new ImageData(canvasWidth, canvasHeight);

  for (let i = 0; i < imageData.data.length; i += 4) {
    imageData.data[i] = 128;
    imageData.data[i + 1] = 128;
    imageData.data[i + 2] = 0;
    imageData.data[i + 3] = 255;
  }

  const radiusSquared = radius * radius;
  const radiusPlusOneSquared = (radius + 1) * (radius + 1);
  const radiusMinusBezelSquared = Math.max(
    0,
    (radius - bezelWidth) * (radius - bezelWidth),
  );
  const widthBetweenRadiuses = objectWidth - radius * 2;
  const heightBetweenRadiuses = objectHeight - radius * 2;
  const objectX = (canvasWidth - objectWidth) / 2;
  const objectY = (canvasHeight - objectHeight) / 2;

  for (let y1 = 0; y1 < objectHeight; y1++) {
    for (let x1 = 0; x1 < objectWidth; x1++) {
      const idx = ((objectY + y1) * canvasWidth + objectX + x1) * 4;
      const isOnLeftSide = x1 < radius;
      const isOnRightSide = x1 >= objectWidth - radius;
      const isOnTopSide = y1 < radius;
      const isOnBottomSide = y1 >= objectHeight - radius;

      const x = isOnLeftSide
        ? x1 - radius
        : isOnRightSide
          ? x1 - radius - widthBetweenRadiuses
          : 0;
      const y = isOnTopSide
        ? y1 - radius
        : isOnBottomSide
          ? y1 - radius - heightBetweenRadiuses
          : 0;

      const distanceToCenterSquared = x * x + y * y;
      const isInBezel =
        distanceToCenterSquared <= radiusPlusOneSquared &&
        distanceToCenterSquared >= radiusMinusBezelSquared;

      if (isInBezel) {
        const opacity =
          distanceToCenterSquared < radiusSquared
            ? 1
            : 1 -
              (Math.sqrt(distanceToCenterSquared) - Math.sqrt(radiusSquared)) /
                (Math.sqrt(radiusPlusOneSquared) - Math.sqrt(radiusSquared));
        const distanceFromCenter = Math.sqrt(distanceToCenterSquared);
        const distanceFromSide = radius - distanceFromCenter;
        const cos = distanceFromCenter > 0 ? x / distanceFromCenter : 0;
        const sin = distanceFromCenter > 0 ? y / distanceFromCenter : 0;
        const bezelRatio = Math.max(
          0,
          Math.min(1, distanceFromSide / bezelWidth),
        );
        const bezelIndex = Math.floor(bezelRatio * precomputedMap.length);
        const distance =
          precomputedMap[
            Math.max(0, Math.min(bezelIndex, precomputedMap.length - 1))
          ] || 0;
        const dX =
          maximumDisplacement > 0 ? (-cos * distance) / maximumDisplacement : 0;
        const dY =
          maximumDisplacement > 0 ? (-sin * distance) / maximumDisplacement : 0;

        imageData.data[idx] = Math.max(
          0,
          Math.min(255, 128 + dX * 127 * opacity),
        );
        imageData.data[idx + 1] = Math.max(
          0,
          Math.min(255, 128 + dY * 127 * opacity),
        );
        imageData.data[idx + 2] = 0;
        imageData.data[idx + 3] = 255;
      }
    }
  }
  return imageData;
}

// Calculate specular highlight
function calculateSpecularHighlight(
  objectWidth,
  objectHeight,
  radius,
  bezelWidth,
  specularAngle = Math.PI / 3,
) {
  const imageData = new ImageData(objectWidth, objectHeight);
  const specularVector = [Math.cos(specularAngle), Math.sin(specularAngle)];
  const specularThickness = 1.5;
  const radiusSquared = radius * radius;
  const radiusPlusOneSquared = (radius + 1) * (radius + 1);
  const radiusMinusSpecularSquared = Math.max(
    0,
    (radius - specularThickness) * (radius - specularThickness),
  );
  const widthBetweenRadiuses = objectWidth - radius * 2;
  const heightBetweenRadiuses = objectHeight - radius * 2;

  for (let y1 = 0; y1 < objectHeight; y1++) {
    for (let x1 = 0; x1 < objectWidth; x1++) {
      const idx = (y1 * objectWidth + x1) * 4;
      const isOnLeftSide = x1 < radius;
      const isOnRightSide = x1 >= objectWidth - radius;
      const isOnTopSide = y1 < radius;
      const isOnBottomSide = y1 >= objectHeight - radius;

      const x = isOnLeftSide
        ? x1 - radius
        : isOnRightSide
          ? x1 - radius - widthBetweenRadiuses
          : 0;
      const y = isOnTopSide
        ? y1 - radius
        : isOnBottomSide
          ? y1 - radius - heightBetweenRadiuses
          : 0;

      const distanceToCenterSquared = x * x + y * y;
      const isNearEdge =
        distanceToCenterSquared <= radiusPlusOneSquared &&
        distanceToCenterSquared >= radiusMinusSpecularSquared;

      if (isNearEdge) {
        const distanceFromCenter = Math.sqrt(distanceToCenterSquared);
        const distanceFromSide = radius - distanceFromCenter;
        const opacity =
          distanceToCenterSquared < radiusSquared
            ? 1
            : 1 -
              (distanceFromCenter - Math.sqrt(radiusSquared)) /
                (Math.sqrt(radiusPlusOneSquared) - Math.sqrt(radiusSquared));
        const cos = distanceFromCenter > 0 ? x / distanceFromCenter : 0;
        const sin = distanceFromCenter > 0 ? -y / distanceFromCenter : 0;
        const dotProduct = Math.abs(
          cos * specularVector[0] + sin * specularVector[1],
        );
        const edgeRatio = Math.max(
          0,
          Math.min(1, distanceFromSide / specularThickness),
        );
        const sharpFalloff = Math.sqrt(1 - (1 - edgeRatio) * (1 - edgeRatio));
        const coefficient = dotProduct * sharpFalloff;
        const color = Math.min(255, 255 * coefficient);
        const finalOpacity = Math.min(255, color * coefficient * opacity);

        imageData.data[idx] = color;
        imageData.data[idx + 1] = color;
        imageData.data[idx + 2] = color;
        imageData.data[idx + 3] = finalOpacity;
      }
    }
  }
  return imageData;
}

// Convert ImageData to data URL
function imageDataToDataURL(imageData) {
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext("2d");
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL();
}

// Update filter and previews
function updateFilter(updateScale = true) {
  const surfaceFn = SurfaceEquations[state.surfaceType];
  const precomputed = calculateDisplacementMap1D(
    state.glassThickness,
    state.bezelWidth,
    surfaceFn,
    state.refractiveIndex,
  );
  state.maximumDisplacement = Math.max(...precomputed.map(Math.abs));

  const displacementData = calculateDisplacementMap2D(
    state.objectWidth,
    state.objectHeight,
    state.objectWidth,
    state.objectHeight,
    state.radius,
    state.bezelWidth,
    state.maximumDisplacement || 1,
    precomputed,
  );
  const specularData = calculateSpecularHighlight(
    state.objectWidth,
    state.objectHeight,
    state.radius,
    state.bezelWidth,
  );

  const displacementUrl = imageDataToDataURL(displacementData);
  const specularUrl = imageDataToDataURL(specularData);

  document
    .getElementById("displacementImage")
    .setAttribute("href", displacementUrl);
  document.getElementById("specularImage").setAttribute("href", specularUrl);

  if (updateScale) {
    document
      .getElementById("displacementMap")
      .setAttribute("scale", state.maximumDisplacement * state.refractionScale);
  }

  document
    .getElementById("specularAlpha")
    .setAttribute("slope", state.specularOpacity);
  document
    .getElementById("filterBlur")
    .setAttribute("stdDeviation", state.blur);

  // Update preview canvases
  const displacementCtx = displacementPreview.getContext("2d");
  displacementCtx.putImageData(displacementData, 0, 0);

  const specularCtx = specularPreview.getContext("2d");
  specularCtx.putImageData(specularData, 0, 0);

  // Update clone position after filter update
  updateContentClonePosition();
}

// Animation loop for spring physics
function animationLoop(timestamp) {
  const dt = Math.min(0.032, 1 / 60);

  if (state.isDragging) {
    springs.scale.setTarget(1.0);
    springs.shadowOffsetX.setTarget(4);
    springs.shadowOffsetY.setTarget(16);
    springs.shadowBlur.setTarget(24);
    springs.shadowAlpha.setTarget(0.22);
    springs.refractionBoost.setTarget(1.0);
  } else {
    springs.scale.setTarget(0.85);
    springs.shadowOffsetX.setTarget(0);
    springs.shadowOffsetY.setTarget(4);
    springs.shadowBlur.setTarget(12);
    springs.shadowAlpha.setTarget(0.15);
    springs.refractionBoost.setTarget(0.8);
  }

  const velocityMagnitude = Math.sqrt(
    state.velocityX ** 2 + state.velocityY ** 2,
  );
  const squishAmount = Math.min(0.15, velocityMagnitude / 3000);

  if (velocityMagnitude > 50) {
    const vxNorm = state.velocityX / velocityMagnitude;
    const vyNorm = state.velocityY / velocityMagnitude;
    springs.scaleX.setTarget(
      1 +
        squishAmount * Math.abs(vxNorm) -
        squishAmount * 0.5 * Math.abs(vyNorm),
    );
    springs.scaleY.setTarget(
      1 +
        squishAmount * Math.abs(vyNorm) -
        squishAmount * 0.5 * Math.abs(vxNorm),
    );
  } else {
    springs.scaleX.setTarget(1);
    springs.scaleY.setTarget(1);
  }

  const scale = springs.scale.update(dt);
  const scaleX = springs.scaleX.update(dt);
  const scaleY = springs.scaleY.update(dt);
  const shadowOffsetX = springs.shadowOffsetX.update(dt);
  const shadowOffsetY = springs.shadowOffsetY.update(dt);
  const shadowBlur = springs.shadowBlur.update(dt);
  const shadowAlpha = springs.shadowAlpha.update(dt);
  const refractionBoost = springs.refractionBoost.update(dt);

  glassElement.style.transform = `scale(${scale * scaleX}, ${scale * scaleY})`;

  const insetAlpha = shadowAlpha * 0.6;
  glassInner.style.boxShadow = `
                    ${shadowOffsetX}px ${shadowOffsetY}px ${shadowBlur}px rgba(0, 0, 0, ${shadowAlpha}),
                    inset ${shadowOffsetX * 0.3}px ${shadowOffsetY * 0.4}px 16px rgba(0, 0, 0, ${insetAlpha}),
                    inset ${-shadowOffsetX * 0.3}px ${-shadowOffsetY * 0.4}px 16px rgba(255, 255, 255, ${insetAlpha * 0.8})
                `;

  const dynamicRefractionScale = state.refractionScale * refractionBoost;
  document
    .getElementById("displacementMap")
    .setAttribute("scale", state.maximumDisplacement * dynamicRefractionScale);

  if (!state.isDragging) {
    state.velocityX *= 0.95;
    state.velocityY *= 0.95;
  }

  const allSettled =
    Object.values(springs).every((s) => s.isSettled()) &&
    Math.abs(state.velocityX) < 1 &&
    Math.abs(state.velocityY) < 1;

  if (!allSettled) {
    animationFrameId = requestAnimationFrame(animationLoop);
  } else {
    animationFrameId = null;
  }
}

function startAnimationLoop() {
  if (!animationFrameId) {
    animationFrameId = requestAnimationFrame(animationLoop);
  }
}

// Dragging functionality
function initDragging() {
  glassElement.addEventListener("mousedown", startDrag);
  glassElement.addEventListener("touchstart", startDrag, {
    passive: false,
  });
  document.addEventListener("mousemove", drag);
  document.addEventListener("touchmove", drag, {
    passive: false,
  });
  document.addEventListener("mouseup", endDrag);
  document.addEventListener("touchend", endDrag);
}

function startDrag(e) {
  e.preventDefault();
  state.isDragging = true;

  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  const rect = glassElement.getBoundingClientRect();

  const currentScale = springs.scale.value;
  const scaledWidth = state.objectWidth * currentScale;
  const scaledHeight = state.objectHeight * currentScale;
  const offsetFromScale = {
    x: (state.objectWidth - scaledWidth) / 2,
    y: (state.objectHeight - scaledHeight) / 2,
  };

  state.dragOffset.x = (clientX - rect.left) / currentScale;
  state.dragOffset.y = (clientY - rect.top) / currentScale;

  state.lastX = clientX;
  state.lastY = clientY;
  state.lastTime = performance.now();
  state.velocityX = 0;
  state.velocityY = 0;

  startAnimationLoop();
}

function drag(e) {
  if (!state.isDragging) return;
  e.preventDefault();

  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  const areaRect = demoArea.getBoundingClientRect();

  const now = performance.now();
  const dt = Math.max(1, now - state.lastTime) / 1000;
  state.velocityX = (clientX - state.lastX) / dt;
  state.velocityY = (clientY - state.lastY) / dt;
  state.lastX = clientX;
  state.lastY = clientY;
  state.lastTime = now;

  let newX = clientX - areaRect.left - state.dragOffset.x;
  let newY = clientY - areaRect.top - state.dragOffset.y;

  const maxX = areaRect.width - state.objectWidth;
  const maxY = areaRect.height - state.objectHeight;

  if (newX < 0) {
    newX = newX * 0.3;
  } else if (newX > maxX) {
    newX = maxX + (newX - maxX) * 0.3;
  }

  if (newY < 0) {
    newY = newY * 0.3;
  } else if (newY > maxY) {
    newY = maxY + (newY - maxY) * 0.3;
  }

  glassElement.style.left = newX + "px";
  glassElement.style.top = newY + "px";

  updateContentClonePosition();
}

function endDrag() {
  if (!state.isDragging) return;
  state.isDragging = false;

  const areaRect = demoArea.getBoundingClientRect();
  let currentX = parseFloat(glassElement.style.left) || 0;
  let currentY = parseFloat(glassElement.style.top) || 0;

  const maxX = areaRect.width - state.objectWidth;
  const maxY = areaRect.height - state.objectHeight;

  currentX = Math.max(0, Math.min(currentX, maxX));
  currentY = Math.max(0, Math.min(currentY, maxY));

  glassElement.style.left = currentX + "px";
  glassElement.style.top = currentY + "px";

  updateContentClonePosition();
  startAnimationLoop();
}

// Initialize controls
function initControls() {
  document.querySelectorAll(".surface-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".surface-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.surfaceType = btn.dataset.surface;
      updateFilter();
    });
  });

  const sliders = {
    bezelWidth: {
      prop: "bezelWidth",
      format: (v) => Math.round(v),
    },
    glassThickness: {
      prop: "glassThickness",
      format: (v) => Math.round(v),
    },
    refractionScale: {
      prop: "refractionScale",
      format: (v) => v.toFixed(2),
    },
    specularOpacity: {
      prop: "specularOpacity",
      format: (v) => v.toFixed(2),
    },
    blur: {
      prop: "blur",
      format: (v) => v.toFixed(1),
    },
  };

  Object.entries(sliders).forEach(([id, config]) => {
    const slider = document.getElementById(id);
    const valueDisplay = document.getElementById(id + "Value");

    slider.addEventListener("input", () => {
      const value = parseFloat(slider.value);
      state[config.prop] = value;
      valueDisplay.textContent = config.format(value);
      updateFilter();
    });
  });
}

// Initialize
function init() {
  detectBackdropFilterSupport();
  initDragging();
  initControls();
  updateFilter(false);
  updateContentClonePosition(true);

  // Set up mode toggle
  const modeToggle = document.getElementById("modeToggle");
  modeToggle.addEventListener("click", toggleRenderMode);

  springs.scale.value = 0.85;
  springs.scale.target = 0.85;
  startAnimationLoop();
}

// ===== SLIDER DEMO =====
const sliderConfig = {
  thumbWidth: 90,
  thumbHeight: 60,
  thumbRadius: 30,
  trackWidth: 330,
  trackHeight: 14,
  bezelWidth: 16,
  glassThickness: 80,
  refractiveIndex: 1.45,
  SCALE_REST: 0.6,
  SCALE_DRAG: 1,
};

const sliderState = {
  value: 10,
  pointerDown: false,
  forceActive: false,
  specularOpacity: 0.4,
  specularSaturation: 7,
  refractionBase: 1,
  blur: 0,
  maximumDisplacement: 0,
};

const sliderSprings = {
  scale: new Spring(sliderConfig.SCALE_REST, 2000, 80),
  backgroundOpacity: new Spring(1, 2000, 80),
  scaleRatio: new Spring(0.4, 100, 10), // motion default: stiffness=100, damping=10
};

let sliderAnimationFrameId = null;

function getSliderActive() {
  return sliderState.forceActive || sliderState.pointerDown;
}

function updateSliderFilter() {
  const surfaceFn = SurfaceEquations.convex_squircle;
  const precomputed = calculateDisplacementMap1D(
    sliderConfig.glassThickness,
    sliderConfig.bezelWidth,
    surfaceFn,
    sliderConfig.refractiveIndex,
  );
  sliderState.maximumDisplacement = Math.max(...precomputed.map(Math.abs));

  const displacementData = calculateDisplacementMap2D(
    sliderConfig.thumbWidth,
    sliderConfig.thumbHeight,
    sliderConfig.thumbWidth,
    sliderConfig.thumbHeight,
    sliderConfig.thumbRadius,
    sliderConfig.bezelWidth,
    sliderState.maximumDisplacement || 1,
    precomputed,
  );

  const specularData = calculateSpecularHighlight(
    sliderConfig.thumbWidth,
    sliderConfig.thumbHeight,
    sliderConfig.thumbRadius,
    sliderConfig.bezelWidth,
  );

  const displacementUrl = imageDataToDataURL(displacementData);
  const specularUrl = imageDataToDataURL(specularData);

  document
    .getElementById("sliderDisplacementImage")
    .setAttribute("href", displacementUrl);
  document
    .getElementById("sliderSpecularImage")
    .setAttribute("href", specularUrl);
  document
    .getElementById("sliderSpecularAlpha")
    .setAttribute("slope", sliderState.specularOpacity);
  document
    .getElementById("sliderFilterBlur")
    .setAttribute("stdDeviation", sliderState.blur);

  document
    .getElementById("sliderSaturation")
    .setAttribute("values", sliderState.specularSaturation);
}

function sliderAnimationLoop() {
  const dt = Math.min(0.032, 1 / 60);
  const isActive = getSliderActive();

  // Update spring targets
  sliderSprings.scale.setTarget(
    isActive ? sliderConfig.SCALE_DRAG : sliderConfig.SCALE_REST,
  );
  sliderSprings.backgroundOpacity.setTarget(isActive ? 0.1 : 1);
  const pressMultiplier = isActive ? 0.9 : 0.4;
  sliderSprings.scaleRatio.setTarget(
    pressMultiplier * sliderState.refractionBase,
  );

  const scale = sliderSprings.scale.update(dt);
  const backgroundOpacity = sliderSprings.backgroundOpacity.update(dt);
  const scaleRatio = sliderSprings.scaleRatio.update(dt);

  const sliderThumb = document.getElementById("sliderThumb");
  const sliderThumbClone = document.getElementById("sliderThumbClone");

  sliderThumb.style.transform = `scale(${scale})`;
  sliderThumb.style.backgroundColor = `rgba(255, 255, 255, ${backgroundOpacity})`;

  // Hide clone when background is opaque (not active), show when translucent (active)
  // Clone opacity is inverse of background opacity
  const cloneOpacity = 1 - backgroundOpacity;
  sliderThumbClone.style.opacity = cloneOpacity;

  // Update displacement scale
  const dynamicScale = sliderState.maximumDisplacement * scaleRatio;
  document
    .getElementById("sliderDisplacementMap")
    .setAttribute("scale", dynamicScale);

  const allSettled = Object.values(sliderSprings).every((s) => s.isSettled());
  if (!allSettled) {
    sliderAnimationFrameId = requestAnimationFrame(sliderAnimationLoop);
  } else {
    sliderAnimationFrameId = null;
  }
}

function startSliderAnimation() {
  if (!sliderAnimationFrameId) {
    sliderAnimationFrameId = requestAnimationFrame(sliderAnimationLoop);
  }
}

function initSliderDemo() {
  const sliderThumb = document.getElementById("sliderThumb");
  const sliderTrack = document.getElementById("sliderTrack");
  const sliderFill = document.getElementById("sliderFill");
  const sliderThumbClone = document.getElementById("sliderThumbClone");
  const sliderForceActive = document.getElementById("sliderForceActive");
  const sliderThumbCloneInner = document.getElementById(
    "sliderThumbCloneInner",
  );

  updateSliderFilter();
  sliderThumbClone.style.filter = "url(#sliderGlassFilter)";

  const thumbWidthRest = sliderConfig.thumbWidth * sliderConfig.SCALE_REST;

  function updateSliderUI() {
    sliderFill.style.width = sliderState.value + "%";

    // Update thumb x position based on value
    const ratio = sliderState.value / 100;
    const x0 = thumbWidthRest / 2;
    const x100 = sliderConfig.trackWidth - thumbWidthRest / 2;
    const thumbCenterX = x0 + ratio * (x100 - x0);
    const thumbX = thumbCenterX - sliderConfig.thumbWidth / 2;
    sliderThumb.style.left = thumbX + "px";

    // Update clone position
    const sliderDemoArea = document.getElementById("sliderDemoArea");
    const areaRect = sliderDemoArea.getBoundingClientRect();
    const containerLeft = (areaRect.width - sliderConfig.trackWidth) / 2;
    const containerTop = (areaRect.height - sliderConfig.thumbHeight) / 2;
    const trackTop = (sliderConfig.thumbHeight - sliderConfig.trackHeight) / 2;

    sliderThumbCloneInner.style.width = areaRect.width + "px";
    sliderThumbCloneInner.style.height = areaRect.height + "px";
    sliderThumbCloneInner.style.transform = `translate(${-(containerLeft + thumbX)}px, ${-containerTop}px)`;

    // Position pseudo-elements for track/fill inside clone
    sliderThumbCloneInner.style.setProperty(
      "--track-left",
      `${containerLeft}px`,
    );
    sliderThumbCloneInner.style.setProperty(
      "--track-top",
      `${containerTop + trackTop}px`,
    );
    sliderThumbCloneInner.style.setProperty(
      "--fill-width",
      sliderState.value.toString(),
    );
  }

  function onPointerDown(e) {
    e.preventDefault();
    sliderState.pointerDown = true;
    startSliderAnimation();
  }

  function onPointerMove(e) {
    if (!sliderState.pointerDown) return;
    e.preventDefault();

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const trackRect = sliderTrack.getBoundingClientRect();

    const x0 = trackRect.left + thumbWidthRest / 2;
    const x100 = trackRect.right - thumbWidthRest / 2;
    const trackInsideWidth = x100 - x0;

    const x = Math.max(x0, Math.min(x100, clientX));
    const ratio = (x - x0) / trackInsideWidth;
    sliderState.value = Math.max(0, Math.min(100, ratio * 100));

    updateSliderUI();
  }

  function onPointerUp() {
    sliderState.pointerDown = false;
    startSliderAnimation();
  }

  sliderThumb.addEventListener("mousedown", onPointerDown);
  sliderThumb.addEventListener("touchstart", onPointerDown, { passive: false });
  sliderTrack.addEventListener("mousedown", (e) => {
    onPointerDown(e);
    onPointerMove(e);
  });

  window.addEventListener("mousemove", onPointerMove);
  window.addEventListener("touchmove", onPointerMove, { passive: false });
  window.addEventListener("mouseup", onPointerUp);
  window.addEventListener("touchend", onPointerUp);

  sliderForceActive.addEventListener("change", (e) => {
    sliderState.forceActive = e.target.checked;
    startSliderAnimation();
  });

  // Setup controls
  const sliderControls = {
    sliderSpecularOpacity: {
      prop: "specularOpacity",
      format: (v) => v.toFixed(2),
      update: () =>
        document
          .getElementById("sliderSpecularAlpha")
          .setAttribute("slope", sliderState.specularOpacity),
    },
    sliderSpecularSaturation: {
      prop: "specularSaturation",
      format: (v) => Math.round(v).toString(),
      update: () =>
        document
          .getElementById("sliderSaturation")
          .setAttribute("values", sliderState.specularSaturation),
    },
    sliderRefraction: {
      prop: "refractionBase",
      format: (v) => v.toFixed(2),
      update: () => startSliderAnimation(),
    },
    sliderBlur: {
      prop: "blur",
      format: (v) => v.toFixed(1),
      update: () =>
        document
          .getElementById("sliderFilterBlur")
          .setAttribute("stdDeviation", sliderState.blur),
    },
  };

  Object.entries(sliderControls).forEach(([id, config]) => {
    const slider = document.getElementById(id);
    const valueDisplay = document.getElementById(id + "Value");
    slider.addEventListener("input", () => {
      const value = parseFloat(slider.value);
      sliderState[config.prop] = value;
      valueDisplay.textContent = config.format(value);
      config.update();
    });
  });

  // Initial render
  updateSliderUI();
  window.addEventListener("resize", updateSliderUI);
  startSliderAnimation();
}

// ===== SWITCH DEMO =====
const switchConfig = {
  trackWidth: 160,
  trackHeight: 67,
  thumbWidth: 146,
  thumbHeight: 92,
  thumbRadius: 46,
  bezelWidth: 19,
  glassThickness: 47,
  refractiveIndex: 1.5,
  THUMB_REST_SCALE: 0.65,
  THUMB_ACTIVE_SCALE: 0.9,
};

// Calculate travel distance
switchConfig.THUMB_REST_OFFSET =
  ((1 - switchConfig.THUMB_REST_SCALE) * switchConfig.thumbWidth) / 2;
switchConfig.TRAVEL =
  switchConfig.trackWidth -
  switchConfig.trackHeight -
  (switchConfig.thumbWidth - switchConfig.thumbHeight) *
    switchConfig.THUMB_REST_SCALE;

const switchState = {
  checked: true,
  pointerDown: false,
  forceActive: false,
  initialPointerX: 0,
  xDragRatio: 1,
  specularOpacity: 0.5,
  specularSaturation: 6,
  refractionBase: 1,
  blur: 0.2,
  maximumDisplacement: 0,
};

const switchSprings = {
  xRatio: new Spring(1, 1000, 80),
  scale: new Spring(switchConfig.THUMB_REST_SCALE, 2000, 80),
  backgroundOpacity: new Spring(1, 2000, 80),
  trackColor: new Spring(1, 1000, 80),
  scaleRatio: new Spring(0.4, 100, 10), // motion default: stiffness=100, damping=10
};

let switchAnimationFrameId = null;

function getSwitchActive() {
  return switchState.forceActive || switchState.pointerDown;
}

function updateSwitchFilter() {
  const surfaceFn = SurfaceEquations.convex_squircle;
  const precomputed = calculateDisplacementMap1D(
    switchConfig.glassThickness,
    switchConfig.bezelWidth,
    surfaceFn,
    switchConfig.refractiveIndex,
  );
  switchState.maximumDisplacement = Math.max(...precomputed.map(Math.abs));

  const displacementData = calculateDisplacementMap2D(
    switchConfig.thumbWidth,
    switchConfig.thumbHeight,
    switchConfig.thumbWidth,
    switchConfig.thumbHeight,
    switchConfig.thumbRadius,
    switchConfig.bezelWidth,
    switchState.maximumDisplacement || 1,
    precomputed,
  );

  const specularData = calculateSpecularHighlight(
    switchConfig.thumbWidth,
    switchConfig.thumbHeight,
    switchConfig.thumbRadius,
    switchConfig.bezelWidth,
  );

  const displacementUrl = imageDataToDataURL(displacementData);
  const specularUrl = imageDataToDataURL(specularData);

  document
    .getElementById("switchDisplacementImage")
    .setAttribute("href", displacementUrl);
  document
    .getElementById("switchSpecularImage")
    .setAttribute("href", specularUrl);
  document
    .getElementById("switchSpecularAlpha")
    .setAttribute("slope", switchState.specularOpacity);
  document
    .getElementById("switchFilterBlur")
    .setAttribute("stdDeviation", switchState.blur);

  document
    .getElementById("switchSaturation")
    .setAttribute("values", switchState.specularSaturation);
}

function switchAnimationLoop() {
  const dt = Math.min(0.032, 1 / 60);
  const isActive = getSwitchActive();

  // Update spring targets
  switchSprings.scale.setTarget(
    isActive ? switchConfig.THUMB_ACTIVE_SCALE : switchConfig.THUMB_REST_SCALE,
  );
  switchSprings.backgroundOpacity.setTarget(isActive ? 0.1 : 1);
  const pressMultiplier = isActive ? 0.9 : 0.4;
  switchSprings.scaleRatio.setTarget(
    pressMultiplier * switchState.refractionBase,
  );

  // xRatio target depends on dragging state
  if (!switchState.pointerDown) {
    switchSprings.xRatio.setTarget(switchState.checked ? 1 : 0);
  }

  // Track color based on position during drag or checked state when not dragging
  const considerChecked = switchState.pointerDown
    ? switchState.xDragRatio > 0.5
      ? 1
      : 0
    : switchState.checked
      ? 1
      : 0;
  switchSprings.trackColor.setTarget(considerChecked);

  const xRatio = switchSprings.xRatio.update(dt);
  const scale = switchSprings.scale.update(dt);
  const backgroundOpacity = switchSprings.backgroundOpacity.update(dt);
  const trackColor = switchSprings.trackColor.update(dt);
  const scaleRatio = switchSprings.scaleRatio.update(dt);

  const switchThumb = document.getElementById("switchThumb");
  const switchTrack = document.getElementById("switchTrack");
  const switchThumbClone = document.getElementById("switchThumbClone");
  const switchThumbCloneInner = document.getElementById(
    "switchThumbCloneInner",
  );

  // Hide clone when background is opaque (not active), show when translucent (active)
  const cloneOpacity = 1 - backgroundOpacity;
  switchThumbClone.style.opacity = cloneOpacity;

  // Calculate thumb position
  const marginLeft =
    -switchConfig.THUMB_REST_OFFSET +
    (switchConfig.trackHeight -
      switchConfig.thumbHeight * switchConfig.THUMB_REST_SCALE) /
      2;
  const thumbX = marginLeft + xRatio * switchConfig.TRAVEL;

  switchThumb.style.left = thumbX + "px";
  switchThumb.style.transform = `translateY(-50%) scale(${scale})`;
  switchThumb.style.backgroundColor = `rgba(255, 255, 255, ${backgroundOpacity})`;

  // Box shadow with inset when pressed
  if (switchState.pointerDown) {
    switchThumb.style.boxShadow =
      "0 4px 22px rgba(0,0,0,0.1), inset 2px 7px 24px rgba(0,0,0,0.09), inset -2px -7px 24px rgba(255,255,255,0.09)";
  } else {
    switchThumb.style.boxShadow = "0 4px 22px rgba(0,0,0,0.1)";
  }

  // Interpolate track color: #94949F77 (off) to #3BBF4EEE (on)
  // Off: rgba(148, 148, 159, 0.47), On: rgba(59, 191, 78, 0.93)
  const offR = 148,
    offG = 148,
    offB = 159,
    offA = 0.47;
  const onR = 59,
    onG = 191,
    onB = 78,
    onA = 0.93;
  const r = Math.round(offR + (onR - offR) * trackColor);
  const g = Math.round(offG + (onG - offG) * trackColor);
  const b = Math.round(offB + (onB - offB) * trackColor);
  const a = offA + (onA - offA) * trackColor;
  const trackBgColor = `rgba(${r}, ${g}, ${b}, ${a})`;
  switchTrack.style.backgroundColor = trackBgColor;

  // Update clone position
  const switchDemoArea = document.getElementById("switchDemoArea");
  const areaRect = switchDemoArea.getBoundingClientRect();
  const containerLeft = (areaRect.width - switchConfig.trackWidth) / 2;
  const containerTop = (areaRect.height - switchConfig.trackHeight) / 2;

  switchThumbCloneInner.style.width = areaRect.width + "px";
  switchThumbCloneInner.style.height = areaRect.height + "px";
  // Thumb is positioned relative to track, which is centered
  // thumbY offset: top: sliderHeight/2, y: -50% -> centered vertically in track
  const thumbYOffset =
    switchConfig.trackHeight / 2 - switchConfig.thumbHeight / 2;
  switchThumbCloneInner.style.transform = `translate(${-(containerLeft + thumbX)}px, ${-(containerTop + thumbYOffset)}px)`;
  switchThumbCloneInner.style.setProperty("--switch-track-color", trackBgColor);
  switchThumbCloneInner.style.setProperty("--track-left", `${containerLeft}px`);
  switchThumbCloneInner.style.setProperty("--track-top", `${containerTop}px`);

  // Update displacement scale
  const dynamicScale = switchState.maximumDisplacement * scaleRatio;
  document
    .getElementById("switchDisplacementMap")
    .setAttribute("scale", dynamicScale);

  const allSettled = Object.values(switchSprings).every((s) => s.isSettled());
  if (!allSettled) {
    switchAnimationFrameId = requestAnimationFrame(switchAnimationLoop);
  } else {
    switchAnimationFrameId = null;
  }
}

function startSwitchAnimation() {
  if (!switchAnimationFrameId) {
    switchAnimationFrameId = requestAnimationFrame(switchAnimationLoop);
  }
}

function initSwitchDemo() {
  const switchThumb = document.getElementById("switchThumb");
  const switchTrack = document.getElementById("switchTrack");
  const switchThumbClone = document.getElementById("switchThumbClone");
  const switchForceActive = document.getElementById("switchForceActive");

  updateSwitchFilter();
  switchThumbClone.style.filter = "url(#switchGlassFilter)";

  function onPointerDown(e) {
    e.preventDefault();
    e.stopPropagation();
    switchState.pointerDown = true;
    switchState.initialPointerX = e.touches ? e.touches[0].clientX : e.clientX;
    switchState.xDragRatio = switchState.checked ? 1 : 0;
    startSwitchAnimation();
  }

  function onPointerMove(e) {
    if (!switchState.pointerDown) return;
    e.stopPropagation();

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const baseRatio = switchState.checked ? 1 : 0;
    const displacementX = clientX - switchState.initialPointerX;
    let ratio = baseRatio + displacementX / switchConfig.TRAVEL;

    // Damped overflow
    const overflow = ratio < 0 ? -ratio : ratio > 1 ? ratio - 1 : 0;
    const overflowSign = ratio < 0 ? -1 : 1;
    const dampedOverflow = (overflowSign * overflow) / 22;
    switchState.xDragRatio = Math.min(1, Math.max(0, ratio)) + dampedOverflow;

    switchSprings.xRatio.setTarget(switchState.xDragRatio);
    startSwitchAnimation();
  }

  function onPointerUp(e) {
    if (!switchState.pointerDown) return;
    switchState.pointerDown = false;

    const clientX = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
    const distance = Math.abs(clientX - switchState.initialPointerX);

    if (distance < 4) {
      // Click - toggle
      switchState.checked = !switchState.checked;
    } else {
      // Drag - decide based on position
      switchState.checked = switchState.xDragRatio > 0.5;
    }

    startSwitchAnimation();
  }

  switchThumb.addEventListener("mousedown", onPointerDown);
  switchThumb.addEventListener("touchstart", onPointerDown, { passive: false });

  switchTrack.addEventListener("click", (e) => {
    if (e.target === switchTrack) {
      switchState.checked = !switchState.checked;
      startSwitchAnimation();
    }
  });

  window.addEventListener("mousemove", onPointerMove);
  window.addEventListener("touchmove", onPointerMove, { passive: false });
  window.addEventListener("mouseup", onPointerUp);
  window.addEventListener("touchend", onPointerUp);

  switchForceActive.addEventListener("change", (e) => {
    switchState.forceActive = e.target.checked;
    startSwitchAnimation();
  });

  // Setup controls
  const switchControls = {
    switchSpecularOpacity: {
      prop: "specularOpacity",
      format: (v) => v.toFixed(2),
      update: () =>
        document
          .getElementById("switchSpecularAlpha")
          .setAttribute("slope", switchState.specularOpacity),
    },
    switchSpecularSaturation: {
      prop: "specularSaturation",
      format: (v) => Math.round(v).toString(),
      update: () =>
        document
          .getElementById("switchSaturation")
          .setAttribute("values", switchState.specularSaturation),
    },
    switchRefraction: {
      prop: "refractionBase",
      format: (v) => v.toFixed(2),
      update: () => startSwitchAnimation(),
    },
    switchBlur: {
      prop: "blur",
      format: (v) => v.toFixed(1),
      update: () =>
        document
          .getElementById("switchFilterBlur")
          .setAttribute("stdDeviation", switchState.blur),
    },
  };

  Object.entries(switchControls).forEach(([id, config]) => {
    const slider = document.getElementById(id);
    const valueDisplay = document.getElementById(id + "Value");
    slider.addEventListener("input", () => {
      const value = parseFloat(slider.value);
      switchState[config.prop] = value;
      valueDisplay.textContent = config.format(value);
      config.update();
    });
  });

  // Initial render
  startSwitchAnimation();
}

// Run on DOM ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    init();
    initSliderDemo();
    initSwitchDemo();
  });
} else {
  init();
  initSliderDemo();
  initSwitchDemo();
}
