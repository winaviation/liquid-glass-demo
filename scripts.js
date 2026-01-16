// Surface equations - define the height profile of the glass bezel
const SurfaceEquations = {
  convex_circle: (x) => Math.sqrt(1 - Math.pow(1 - x, 2)),
  convex_squircle: (x) => Math.pow(1 - Math.pow(1 - x, 4), 1 / 4),
  concave: (x) => 1 - Math.sqrt(1 - Math.pow(1 - x, 2)),
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
  glassThickness: 80,
  refractiveIndex: 1.5,
  refractionScale: 1,
  specularOpacity: 0.5,
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
const displacementPreview = document.getElementById("displacementPreview");
const specularPreview = document.getElementById("specularPreview");

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

// Calculate specular highlight - thin bright edge
function calculateSpecularHighlight(
  objectWidth,
  objectHeight,
  radius,
  bezelWidth,
  specularAngle = Math.PI / 3,
) {
  const imageData = new ImageData(objectWidth, objectHeight);

  const specularVector = [Math.cos(specularAngle), Math.sin(specularAngle)];

  // Specular only appears within this many pixels of the edge
  const specularThickness = 1.5;

  const radiusSquared = radius * radius;
  const radiusPlusOneSquared = (radius + 1) * (radius + 1);
  // Only process a thin band near the edge, not the whole bezel
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

      // Only process thin edge region
      const isNearEdge =
        distanceToCenterSquared <= radiusPlusOneSquared &&
        distanceToCenterSquared >= radiusMinusSpecularSquared;

      if (isNearEdge) {
        const distanceFromCenter = Math.sqrt(distanceToCenterSquared);
        const distanceFromSide = radius - distanceFromCenter;

        // Anti-aliasing at the outer edge
        const opacity =
          distanceToCenterSquared < radiusSquared
            ? 1
            : 1 -
              (distanceFromCenter - Math.sqrt(radiusSquared)) /
                (Math.sqrt(radiusPlusOneSquared) - Math.sqrt(radiusSquared));

        const cos = distanceFromCenter > 0 ? x / distanceFromCenter : 0;
        const sin = distanceFromCenter > 0 ? -y / distanceFromCenter : 0;

        // Dot product determines brightness based on light angle
        const dotProduct = Math.abs(
          cos * specularVector[0] + sin * specularVector[1],
        );

        // Sharp falloff - only bright right at the edge
        // This creates the thin bright line effect
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

  // Calculate 1D displacement map
  const precomputed = calculateDisplacementMap1D(
    state.glassThickness,
    state.bezelWidth,
    surfaceFn,
    state.refractiveIndex,
  );

  // Find maximum displacement
  state.maximumDisplacement = Math.max(...precomputed.map(Math.abs));

  // Calculate 2D displacement map
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

  // Calculate specular highlight
  const specularData = calculateSpecularHighlight(
    state.objectWidth,
    state.objectHeight,
    state.radius,
    state.bezelWidth,
  );

  // Convert to data URLs
  const displacementUrl = imageDataToDataURL(displacementData);
  const specularUrl = imageDataToDataURL(specularData);

  // Update SVG filter
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

  // Update glass element backdrop-filter
  glassInner.style.backdropFilter = "url(#liquidGlassFilter)";
  glassInner.style.webkitBackdropFilter = "url(#liquidGlassFilter)";

  // Update preview canvases
  const displacementCtx = displacementPreview.getContext("2d");
  displacementCtx.putImageData(displacementData, 0, 0);

  const specularCtx = specularPreview.getContext("2d");
  specularCtx.putImageData(specularData, 0, 0);
}

// Animation loop for spring physics
function animationLoop(timestamp) {
  const dt = Math.min(0.032, 1 / 60); // Cap delta time

  // Update spring targets based on dragging state
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

  // Velocity-based squish (stretch in direction of movement)
  const velocityMagnitude = Math.sqrt(
    state.velocityX ** 2 + state.velocityY ** 2,
  );
  const squishAmount = Math.min(0.15, velocityMagnitude / 3000);

  // Determine squish direction based on velocity
  if (velocityMagnitude > 50) {
    const vxNorm = state.velocityX / velocityMagnitude;
    const vyNorm = state.velocityY / velocityMagnitude;
    // Stretch along velocity, compress perpendicular
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

  // Update all springs
  const scale = springs.scale.update(dt);
  const scaleX = springs.scaleX.update(dt);
  const scaleY = springs.scaleY.update(dt);
  const shadowOffsetX = springs.shadowOffsetX.update(dt);
  const shadowOffsetY = springs.shadowOffsetY.update(dt);
  const shadowBlur = springs.shadowBlur.update(dt);
  const shadowAlpha = springs.shadowAlpha.update(dt);
  const refractionBoost = springs.refractionBoost.update(dt);

  // Apply transforms
  glassElement.style.transform = `scale(${scale * scaleX}, ${scale * scaleY})`;

  // Apply dynamic shadow
  const insetAlpha = shadowAlpha * 0.6;
  glassInner.style.boxShadow = `
                    ${shadowOffsetX}px ${shadowOffsetY}px ${shadowBlur}px rgba(0, 0, 0, ${shadowAlpha}),
                    inset ${shadowOffsetX * 0.3}px ${shadowOffsetY * 0.4}px 16px rgba(0, 0, 0, ${insetAlpha}),
                    inset ${-shadowOffsetX * 0.3}px ${-shadowOffsetY * 0.4}px 16px rgba(255, 255, 255, ${insetAlpha * 0.8})
                `;

  // Update refraction scale dynamically
  const dynamicRefractionScale = state.refractionScale * refractionBoost;
  document
    .getElementById("displacementMap")
    .setAttribute("scale", state.maximumDisplacement * dynamicRefractionScale);

  // Decay velocity when not dragging
  if (!state.isDragging) {
    state.velocityX *= 0.95;
    state.velocityY *= 0.95;
  }

  // Check if all springs are settled
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

  // Account for current scale when calculating offset
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

  // Calculate velocity
  const now = performance.now();
  const dt = Math.max(1, now - state.lastTime) / 1000;
  state.velocityX = (clientX - state.lastX) / dt;
  state.velocityY = (clientY - state.lastY) / dt;
  state.lastX = clientX;
  state.lastY = clientY;
  state.lastTime = now;

  let newX = clientX - areaRect.left - state.dragOffset.x;
  let newY = clientY - areaRect.top - state.dragOffset.y;

  // Constrain to demo area with some elasticity at edges
  const maxX = areaRect.width - state.objectWidth;
  const maxY = areaRect.height - state.objectHeight;

  if (newX < 0) {
    newX = newX * 0.3; // Elastic resistance
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
}

function endDrag() {
  if (!state.isDragging) return;
  state.isDragging = false;

  // Snap back if outside bounds
  const areaRect = demoArea.getBoundingClientRect();
  let currentX = parseFloat(glassElement.style.left) || 0;
  let currentY = parseFloat(glassElement.style.top) || 0;

  const maxX = areaRect.width - state.objectWidth;
  const maxY = areaRect.height - state.objectHeight;

  currentX = Math.max(0, Math.min(currentX, maxX));
  currentY = Math.max(0, Math.min(currentY, maxY));

  glassElement.style.left = currentX + "px";
  glassElement.style.top = currentY + "px";

  startAnimationLoop();
}

// Initialize controls
function initControls() {
  // Surface type buttons
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

  // Sliders
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
  initDragging();
  initControls();
  updateFilter(false);

  // Set initial spring values and start animation to apply initial state
  springs.scale.value = 0.85;
  springs.scale.target = 0.85;
  startAnimationLoop();
}

// Run on DOM ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
