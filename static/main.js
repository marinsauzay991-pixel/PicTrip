// ============================================================
// PicTrip — Globe + Auth + Stockage local (IndexedDB)
// ============================================================

import * as db from "./db.js";

let currentUser = null;
let trips = [];
const allMarkers = [];
let mapInstance = null;
let inTripView = false;
let rotateSpeed = 3;

// ============================================================
// Auth
// ============================================================

const authScreen = document.getElementById("auth-screen");
const appDiv = document.getElementById("app");
const loginForm = document.getElementById("login-form");
const signupForm = document.getElementById("signup-form");
const authError = document.getElementById("auth-error");
const switchToSignup = document.getElementById("switch-to-signup");
const switchToLogin = document.getElementById("switch-to-login");
const userBtn = document.getElementById("user-btn");
const userMenu = document.getElementById("user-menu");
const userMenuName = document.getElementById("user-menu-name");
const userMenuEmail = document.getElementById("user-menu-email");
const logoutBtn = document.getElementById("logout-btn");

function showAuthError(msg) {
  authError.textContent = msg;
  authError.classList.remove("hidden");
}

function hideAuthError() {
  authError.classList.add("hidden");
}

switchToSignup.addEventListener("click", () => {
  loginForm.classList.add("hidden");
  signupForm.classList.remove("hidden");
  switchToSignup.classList.add("hidden");
  switchToLogin.classList.remove("hidden");
  hideAuthError();
});

switchToLogin.addEventListener("click", () => {
  signupForm.classList.add("hidden");
  loginForm.classList.remove("hidden");
  switchToLogin.classList.add("hidden");
  switchToSignup.classList.remove("hidden");
  hideAuthError();
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideAuthError();
  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;

  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) {
    showAuthError(data.error);
    return;
  }
  currentUser = data;
  enterApp();
});

signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideAuthError();
  const username = document.getElementById("signup-username").value;
  const email = document.getElementById("signup-email").value;
  const password = document.getElementById("signup-password").value;

  const res = await fetch("/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, email, password }),
  });
  const data = await res.json();
  if (!res.ok) {
    showAuthError(data.error);
    return;
  }
  currentUser = data;
  enterApp();
});

// Menu utilisateur
userBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  userMenu.classList.toggle("hidden");
});

document.addEventListener("click", () => {
  userMenu.classList.add("hidden");
});

logoutBtn.addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST" });
  currentUser = null;
  appDiv.classList.add("hidden");
  authScreen.classList.remove("hidden");
  userMenu.classList.add("hidden");
});

// Vérifier si déjà connecté
async function checkAuth() {
  const res = await fetch("/api/auth/me");
  const data = await res.json();
  if (data && data.id) {
    currentUser = data;
    enterApp();
  }
}

function enterApp() {
  authScreen.classList.add("hidden");
  appDiv.classList.remove("hidden");
  userMenuName.textContent = currentUser.username;
  userMenuEmail.textContent = currentUser.email;
  initMap();
  loadTrips();
}

checkAuth();

// ============================================================
// Globe MapLibre
// ============================================================

function initMap() {
  if (mapInstance) return;

  mapInstance = new maplibregl.Map({
    container: "map",
    style: "https://tiles.openfreemap.org/styles/liberty",
    center: [2.35, 48.86],
    zoom: 1.5,
    minZoom: 1.5,
    maxZoom: 19,
    maxPitch: 85,
  });

  mapInstance.on("style.load", () => {
    mapInstance.setProjection({ type: "globe" });
  });

  // Rotation
  let autoRotate = true;
  let idleTimer = null;

  function pauseRotation() {
    clearTimeout(idleTimer);
    autoRotate = false;
    idleTimer = setTimeout(() => {
      autoRotate = true;
    }, 3000);
  }

  ["mousedown", "touchstart", "wheel"].forEach((evt) =>
    mapInstance.getCanvas().addEventListener(evt, pauseRotation, { passive: true })
  );
  mapInstance.on("dragstart", pauseRotation);

  let lastTime = performance.now();
  function rotateGlobe(now) {
    const dt = (now - lastTime) / 1000;
    lastTime = now;
    if (autoRotate && !mapInstance.isMoving()) {
      const center = mapInstance.getCenter();
      center.lng -= rotateSpeed * dt;
      mapInstance.setCenter(center);
    }
    requestAnimationFrame(rotateGlobe);
  }
  requestAnimationFrame(rotateGlobe);
}

// ============================================================
// Upload
// ============================================================

const addBtn = document.getElementById("add-btn");
const tripsBtn = document.getElementById("trips-btn");
const uploadPanel = document.getElementById("upload-panel");
const tripNameInput = document.getElementById("trip-name-input");
const tripSelectRow = document.getElementById("trip-select-row");
const tripSelect = document.getElementById("trip-select");
const dropZone = document.getElementById("drop-zone");
const fileInput = document.getElementById("file-input");
const fileList = document.getElementById("file-list");
const placeBtn = document.getElementById("place-btn");
const uploadStatus = document.getElementById("upload-status");
const tripsPanel = document.getElementById("trips-panel");
const tripsList = document.getElementById("trips-list");
const tripsEmpty = document.getElementById("trips-empty");

let pendingFiles = [];
let uploadTargetTripId = null;

function openPanel(panel) {
  panel.classList.remove("hidden");
}

function closePanel(panel) {
  panel.classList.add("hidden");
}

function closePanelAndReset(panel) {
  closePanel(panel);
  if (panel === uploadPanel) resetUploadState();
}

function resetUploadState() {
  pendingFiles = [];
  uploadTargetTripId = null;
  fileList.classList.add("hidden");
  fileList.innerHTML = "";
  placeBtn.classList.add("hidden");
  uploadStatus.classList.add("hidden");
  uploadStatus.textContent = "";
  dropZone.classList.remove("has-files");
  tripNameInput.value = "";
}

document.querySelectorAll(".panel-close").forEach((btn) => {
  btn.addEventListener("click", () => closePanelAndReset(btn.closest(".panel")));
});
document.querySelectorAll(".panel-backdrop").forEach((bg) => {
  bg.addEventListener("click", () => closePanelAndReset(bg.closest(".panel")));
});

addBtn.addEventListener("click", () => {
  uploadTargetTripId = null;
  document.getElementById("trip-name-bubble").style.display = "";
  populateTripSelect();
  openPanel(uploadPanel);
});

tripsBtn.addEventListener("click", () => {
  renderTripsPanel();
  openPanel(tripsPanel);
});

// Drag & drop
dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("dragover");
});
dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("dragover");
});
dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragover");
  stageFiles(e.dataTransfer.files);
});

fileInput.addEventListener("change", () => {
  stageFiles(fileInput.files);
  fileInput.value = "";
});

function stageFiles(newFiles) {
  const images = Array.from(newFiles).filter((f) => f.type.startsWith("image/"));
  if (images.length === 0) return;

  pendingFiles = pendingFiles.concat(images);
  dropZone.classList.add("has-files");
  fileList.classList.remove("hidden");
  fileList.innerHTML = "";

  pendingFiles.forEach((file) => {
    const thumb = URL.createObjectURL(file);
    const item = document.createElement("div");
    item.className = "file-item";
    item.innerHTML = `<img class="file-icon" src="${thumb}" alt="" /><span class="file-name">${file.name}</span>`;
    fileList.appendChild(item);
  });

  placeBtn.classList.remove("hidden");
  placeBtn.textContent = `Placer (${pendingFiles.length} photo${pendingFiles.length > 1 ? "s" : ""})`;
}

// Bouton Placer → lecture EXIF + stockage IndexedDB
placeBtn.addEventListener("click", async () => {
  if (pendingFiles.length === 0) return;

  let tripId = uploadTargetTripId;

  if (!tripId) {
    const name = tripNameInput.value.trim();
    const selectedExisting = tripSelect.value;

    if (selectedExisting) {
      tripId = selectedExisting;
    } else if (name) {
      const trip = await db.createTrip(name);
      tripId = trip.id;
    } else {
      tripNameInput.focus();
      tripNameInput.style.outline = "2px solid rgba(255,100,100,0.6)";
      setTimeout(() => (tripNameInput.style.outline = ""), 1500);
      return;
    }
  }

  placeBtn.disabled = true;
  placeBtn.textContent = "Placement en cours…";
  uploadStatus.classList.remove("hidden");

  let placed = 0;
  let noGps = 0;

  for (const file of pendingFiles) {
    let coords = null;
    let takenAt = null;
    try {
      const parsed = await exifr.parse(file, { gps: true, pick: ["DateTimeOriginal", "CreateDate", "latitude", "longitude"] });
      if (parsed) {
        if (parsed.latitude && parsed.longitude) {
          coords = { lat: parsed.latitude, lng: parsed.longitude };
          placed++;
        } else {
          noGps++;
        }
        const dt = parsed.DateTimeOriginal || parsed.CreateDate;
        if (dt) takenAt = new Date(dt).getTime();
      } else {
        noGps++;
      }
    } catch {
      noGps++;
    }
    await db.addPhoto(tripId, file, coords, takenAt);
  }

  let msg = `${placed} localisée${placed > 1 ? "s" : ""}`;
  if (noGps > 0) msg += ` · ${noGps} sans GPS`;
  uploadStatus.textContent = msg;

  await loadTrips();

  if (placed > 0) {
    setTimeout(() => {
      closePanelAndReset(uploadPanel);
      fitToTripMarkers(tripId);
    }, 600);
  }

  placeBtn.disabled = false;
  placeBtn.textContent = "Placer";
  pendingFiles = [];
});

function populateTripSelect() {
  if (trips.length === 0) {
    tripSelectRow.classList.add("hidden");
    return;
  }
  tripSelectRow.classList.remove("hidden");
  tripSelect.innerHTML = '<option value="">— Nouveau voyage —</option>';
  trips.forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = t.name;
    tripSelect.appendChild(opt);
  });
}

tripSelect.addEventListener("change", () => {
  document.getElementById("trip-name-bubble").style.display = tripSelect.value ? "none" : "";
});

// ============================================================
// Panneau voyages
// ============================================================

async function renderTripsPanel() {
  tripsList.innerHTML = "";
  tripsEmpty.style.display = trips.length === 0 ? "" : "none";

  for (const trip of trips) {
    const photos = await db.getPhotosByTrip(trip.id);
    const gpsYes = photos.filter((p) => p.has_gps).length;
    const gpsNo = photos.filter((p) => !p.has_gps).length;
    const total = photos.length;
    const coverPhoto = photos.find((p) => p.has_gps) || photos[0];

    const card = document.createElement("div");
    card.className = "trip-card";
    card.addEventListener("click", () => {
      closePanel(tripsPanel);
      openGallery(trip.id, trip.name);
    });

    let thumbHtml;
    if (coverPhoto) {
      const url = db.getPhotoURL(coverPhoto);
      thumbHtml = `<img class="trip-thumb" src="${url}" alt="" />`;
    } else {
      thumbHtml = `<div class="trip-thumb-placeholder">✈</div>`;
    }

    card.innerHTML = `
      ${thumbHtml}
      <div class="trip-info">
        <div class="trip-name">${trip.name}</div>
        <div class="trip-stats">
          ${total} photo${total > 1 ? "s" : ""}
          ${gpsYes > 0 ? ` · <span class="gps-yes">${gpsYes} localisée${gpsYes > 1 ? "s" : ""}</span>` : ""}
          ${gpsNo > 0 ? ` · <span class="gps-no">${gpsNo} sans GPS</span>` : ""}
        </div>
      </div>
    `;

    const addMoreBtn = document.createElement("button");
    addMoreBtn.className = "trip-add-btn";
    addMoreBtn.innerHTML = "+";
    addMoreBtn.title = "Ajouter des photos";
    addMoreBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closePanel(tripsPanel);
      uploadTargetTripId = trip.id;
      document.getElementById("trip-name-bubble").style.display = "none";
      tripSelectRow.classList.add("hidden");
      openPanel(uploadPanel);
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "trip-delete-btn";
    deleteBtn.innerHTML = "×";
    deleteBtn.title = "Supprimer ce voyage";
    deleteBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm(`Supprimer "${trip.name}" et toutes ses photos ?`)) return;
      await db.deleteTrip(trip.id);
      await loadTrips();
      renderTripsPanel();
    });

    const globeBtn = document.createElement("button");
    globeBtn.className = "trip-globe-btn";
    globeBtn.innerHTML = "🌍";
    globeBtn.title = "Voir sur le globe";
    globeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closePanel(tripsPanel);
      showTripOnGlobe(trip.id, trip.name);
    });

    card.appendChild(globeBtn);
    card.appendChild(addMoreBtn);
    card.appendChild(deleteBtn);
    tripsList.appendChild(card);
  }
}

// ============================================================
// Galerie photo
// ============================================================

const galleryPanel = document.getElementById("gallery-panel");
const galleryGrid = document.getElementById("gallery-grid");
const galleryTitle = document.getElementById("gallery-title");
const galleryCount = document.getElementById("gallery-count");
const galleryEmpty = document.getElementById("gallery-empty");

const lightbox = document.getElementById("lightbox");
const lightboxImg = document.getElementById("lightbox-img");
const lightboxCaption = document.getElementById("lightbox-caption");
const lightboxClose = document.getElementById("lightbox-close");
const lightboxPrev = document.getElementById("lightbox-prev");
const lightboxNext = document.getElementById("lightbox-next");
const lightboxMapContainer = document.getElementById("lightbox-map-container");

let galleryPhotos = [];
let lightboxIndex = 0;
let lightboxMap = null;
let lightboxMarker = null;

async function openGallery(tripId, tripName) {
  const photos = await db.getPhotosByTrip(tripId);
  galleryPhotos = photos;

  galleryTitle.textContent = tripName;
  galleryCount.textContent = `${photos.length} photo${photos.length > 1 ? "s" : ""}`;
  galleryEmpty.style.display = photos.length === 0 ? "" : "none";
  galleryGrid.innerHTML = "";

  photos.forEach((photo, index) => {
    const url = db.getPhotoURL(photo);
    const item = document.createElement("div");
    item.className = "gallery-item";
    item.innerHTML = `
      <img src="${url}" alt="${photo.name}" />
      <div class="gps-badge ${photo.has_gps ? "yes" : "no"}">${photo.has_gps ? "📍" : "—"}</div>
    `;
    item.addEventListener("click", () => openLightbox(index));
    galleryGrid.appendChild(item);
  });

  openPanel(galleryPanel);
}

function openLightbox(index) {
  if (galleryPhotos.length === 0) return;
  lightboxIndex = index;
  lightbox.classList.remove("hidden");
  updateLightbox(true);
}

function closeLightbox() {
  lightbox.classList.add("hidden");
  if (lightboxMap) {
    lightboxMap.remove();
    lightboxMap = null;
    lightboxMarker = null;
  }
}

function initLightboxMap(lat, lng) {
  if (lightboxMap) {
    lightboxMap.remove();
    lightboxMarker = null;
  }
  lightboxMap = new maplibregl.Map({
    container: "lightbox-map",
    style: "https://tiles.openfreemap.org/styles/liberty",
    center: [lng, lat],
    zoom: 12,
    interactive: true,
    attributionControl: false,
  });
  lightboxMarker = new maplibregl.Marker({ color: "#4aa3ff" })
    .setLngLat([lng, lat])
    .addTo(lightboxMap);
}

function updateLightbox(firstOpen) {
  const photo = galleryPhotos[lightboxIndex];
  const url = db.getPhotoURL(photo);
  lightboxImg.src = url;
  lightboxCaption.textContent = `${photo.name}  ·  ${lightboxIndex + 1} / ${galleryPhotos.length}`;
  lightboxPrev.style.display = galleryPhotos.length > 1 ? "" : "none";
  lightboxNext.style.display = galleryPhotos.length > 1 ? "" : "none";

  if (photo.has_gps) {
    lightboxMapContainer.classList.remove("hidden");
    if (firstOpen || !lightboxMap) {
      setTimeout(() => initLightboxMap(photo.lat, photo.lng), 50);
    } else {
      lightboxMarker.setLngLat([photo.lng, photo.lat]);
      lightboxMap.flyTo({ center: [photo.lng, photo.lat], zoom: 12, duration: 1200 });
    }
  } else {
    lightboxMapContainer.classList.add("hidden");
  }
}

lightboxClose.addEventListener("click", closeLightbox);
lightbox.addEventListener("click", (e) => {
  if (e.target === lightbox) closeLightbox();
});

lightboxPrev.addEventListener("click", (e) => {
  e.stopPropagation();
  lightboxIndex = (lightboxIndex - 1 + galleryPhotos.length) % galleryPhotos.length;
  updateLightbox();
});

lightboxNext.addEventListener("click", (e) => {
  e.stopPropagation();
  lightboxIndex = (lightboxIndex + 1) % galleryPhotos.length;
  updateLightbox();
});

document.addEventListener("keydown", (e) => {
  if (lightbox.classList.contains("hidden")) return;
  if (e.key === "Escape") closeLightbox();
  if (e.key === "ArrowLeft") { lightboxIndex = (lightboxIndex - 1 + galleryPhotos.length) % galleryPhotos.length; updateLightbox(); }
  if (e.key === "ArrowRight") { lightboxIndex = (lightboxIndex + 1) % galleryPhotos.length; updateLightbox(); }
});

// ============================================================
// Marqueurs
// ============================================================

async function placeAllMarkers() {
  allMarkers.forEach((m) => m.remove());
  allMarkers.length = 0;

  const allPhotos = await db.getAllPhotos();
  allPhotos
    .filter((p) => p.has_gps)
    .forEach((photo) => {
      const url = db.getPhotoURL(photo);
      const el = document.createElement("div");
      el.className = "photo-marker";
      el.style.backgroundImage = `url(${url})`;

      const popup = new maplibregl.Popup({
        offset: 25,
        closeButton: true,
        maxWidth: "320px",
      }).setHTML(
        `<div class="photo-popup">
           <img src="${url}" alt="${photo.name}" />
           <p>${photo.name}</p>
         </div>`
      );

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([photo.lng, photo.lat])
        .setPopup(popup)
        .addTo(mapInstance);

      marker._tripId = photo.tripId;
      allMarkers.push(marker);
    });
}

function fitToTripMarkers(tripId) {
  const tripMarkers = allMarkers.filter((m) => m._tripId === tripId);
  if (tripMarkers.length === 0) return;
  if (tripMarkers.length === 1) {
    mapInstance.flyTo({ center: tripMarkers[0].getLngLat(), zoom: 6, duration: 1500 });
    return;
  }
  const bounds = new maplibregl.LngLatBounds();
  tripMarkers.forEach((m) => bounds.extend(m.getLngLat()));
  mapInstance.fitBounds(bounds, { padding: 80, duration: 1500 });
}

// ============================================================
// Tracé de route + estimation transport
// ============================================================

const routeMarkers = [];

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function estimateTransport(distKm, timeDiffHours) {
  if (distKm > 500) return "plane";
  if (timeDiffHours && timeDiffHours > 0) {
    const speed = distKm / timeDiffHours;
    if (speed > 300) return "plane";
    if (speed > 80) return "train";
    if (speed > 2) return "car";
    return "walk";
  }
  if (distKm > 300) return "plane";
  if (distKm > 50) return "car";
  if (distKm > 2) return "car";
  return "walk";
}

const transportIcons = {
  plane: "✈",
  train: "🚌",
  car: "🚗",
  walk: "🚶",
};

function generateArc(start, end, numPoints) {
  const coords = [];
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    const lat = start[1] + t * (end[1] - start[1]);
    const lng = start[0] + t * (end[0] - start[0]);
    const alt = Math.sin(t * Math.PI) * 0.15 * haversineKm(start[1], start[0], end[1], end[0]) / 100;
    coords.push([lng + alt * 0.01, lat]);
  }
  return coords;
}

async function drawTripRoute(tripId) {
  clearTripRoute();

  const photos = await db.getPhotosByTrip(tripId);
  const gpsPhotos = photos
    .filter((p) => p.has_gps)
    .sort((a, b) => {
      if (a.takenAt && b.takenAt) return a.takenAt - b.takenAt;
      if (a.takenAt) return -1;
      if (b.takenAt) return 1;
      return a.addedAt - b.addedAt;
    });

  if (gpsPhotos.length < 2) return;

  for (let i = 0; i < gpsPhotos.length - 1; i++) {
    const from = gpsPhotos[i];
    const to = gpsPhotos[i + 1];
    const dist = haversineKm(from.lat, from.lng, to.lat, to.lng);

    let timeDiff = null;
    if (from.takenAt && to.takenAt) {
      timeDiff = (to.takenAt - from.takenAt) / (1000 * 60 * 60);
    }

    const transport = estimateTransport(dist, timeDiff);
    const color = transportColors[transport];
    const sourceId = `route-${tripId}-${i}`;
    const layerId = `route-layer-${tripId}-${i}`;

    let lineCoords;
    if (transport === "plane") {
      lineCoords = generateArc([from.lng, from.lat], [to.lng, to.lat], 40);
    } else {
      lineCoords = [[from.lng, from.lat], [to.lng, to.lat]];
    }

    try {
      if (mapInstance.getLayer(layerId)) mapInstance.removeLayer(layerId);
      if (mapInstance.getSource(sourceId)) mapInstance.removeSource(sourceId);

      mapInstance.addSource(sourceId, {
        type: "geojson",
        data: {
          type: "Feature",
          geometry: { type: "LineString", coordinates: lineCoords },
        },
      });

      mapInstance.addLayer({
        id: layerId,
        type: "line",
        source: sourceId,
        paint: {
          "line-color": "#ffffff",
          "line-width": 2.5,
          "line-opacity": 0.8,
          "line-dasharray": transport === "plane" ? [6, 4] : [1],
        },
      });
    } catch (err) {
      console.error("Route draw error:", err);
      continue;
    }

    const midIdx = Math.floor(lineCoords.length / 2);
    const midPoint = lineCoords[midIdx];

    const iconEl = document.createElement("div");
    iconEl.className = "transport-icon";
    iconEl.textContent = transportIcons[transport];

    const marker = new maplibregl.Marker({ element: iconEl })
      .setLngLat(midPoint)
      .addTo(mapInstance);
    routeMarkers.push({ marker, sourceId, layerId });
  }
}

function clearTripRoute() {
  routeMarkers.forEach(({ marker, sourceId, layerId }) => {
    marker.remove();
    if (mapInstance.getLayer(layerId)) mapInstance.removeLayer(layerId);
    if (mapInstance.getSource(sourceId)) mapInstance.removeSource(sourceId);
  });
  routeMarkers.length = 0;
}

// ============================================================
// Mode voyage (globe filtré)
// ============================================================

const backBtn = document.getElementById("back-btn");
const tripViewOverlay = document.getElementById("trip-view-overlay");
const tripViewName = document.getElementById("trip-view-name");
const fabStack = document.getElementById("fab-stack");
const overlay = document.getElementById("overlay");

function showTripOnGlobe(tripId, tripName) {
  inTripView = true;
  tripViewName.textContent = tripName;
  tripViewOverlay.classList.remove("hidden");
  backBtn.classList.remove("hidden");
  fabStack.classList.add("hidden");
  overlay.classList.add("hidden");
  userBtn.classList.add("hidden");

  // Accélérer la rotation pendant le chargement
  rotateSpeed = 30;

  allMarkers.forEach((m) => {
    const el = m.getElement();
    if (m._tripId === tripId) {
      el.style.display = "";
    } else {
      el.style.display = "none";
    }
  });

  fitToTripMarkers(tripId);

  mapInstance.once("idle", async () => {
    await drawTripRoute(tripId);
    // Ralentir progressivement
    const slowDown = setInterval(() => {
      rotateSpeed *= 0.85;
      if (rotateSpeed <= 3) {
        rotateSpeed = 3;
        clearInterval(slowDown);
      }
    }, 50);
  });
}

function exitTripView() {
  inTripView = false;
  rotateSpeed = 3;
  tripViewOverlay.classList.add("hidden");
  backBtn.classList.add("hidden");
  fabStack.classList.remove("hidden");
  overlay.classList.remove("hidden");
  userBtn.classList.remove("hidden");

  clearTripRoute();

  allMarkers.forEach((m) => {
    m.getElement().style.display = "";
  });
}

backBtn.addEventListener("click", exitTripView);

// ============================================================
// Chargement des données
// ============================================================

async function loadTrips() {
  trips = await db.getTrips();
  if (mapInstance) await placeAllMarkers();
}
