// ============================================================
// PicTrip — Stockage local (IndexedDB)
// Les photos et voyages restent sur l'ordinateur de l'utilisateur
// ============================================================

const DB_NAME = "pictrip";
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("trips")) {
        db.createObjectStore("trips", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("photos")) {
        const store = db.createObjectStore("photos", { keyPath: "id" });
        store.createIndex("tripId", "tripId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ─── Voyages ───

export async function getTrips() {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction("trips", "readonly");
    const req = tx.objectStore("trips").getAll();
    req.onsuccess = () => resolve(req.result);
  });
}

export async function createTrip(name) {
  const trip = { id: crypto.randomUUID(), name, createdAt: Date.now() };
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction("trips", "readwrite");
    tx.objectStore("trips").put(trip);
    tx.oncomplete = () => resolve(trip);
  });
}

export async function deleteTrip(tripId) {
  const db = await openDB();
  // Supprimer les photos du voyage
  const photos = await getPhotosByTrip(tripId);
  const tx = db.transaction(["trips", "photos"], "readwrite");
  tx.objectStore("trips").delete(tripId);
  photos.forEach((p) => tx.objectStore("photos").delete(p.id));
  return new Promise((resolve) => {
    tx.oncomplete = () => resolve();
  });
}

// ─── Photos ───

export async function getPhotosByTrip(tripId) {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction("photos", "readonly");
    const idx = tx.objectStore("photos").index("tripId");
    const req = idx.getAll(tripId);
    req.onsuccess = () => resolve(req.result);
  });
}

export async function getAllPhotos() {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction("photos", "readonly");
    const req = tx.objectStore("photos").getAll();
    req.onsuccess = () => resolve(req.result);
  });
}

export async function addPhoto(tripId, file, coords) {
  const photo = {
    id: crypto.randomUUID(),
    tripId,
    name: file.name,
    type: file.type,
    blob: file,
    has_gps: !!coords,
    lat: coords ? coords.lat : null,
    lng: coords ? coords.lng : null,
    addedAt: Date.now(),
  };
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction("photos", "readwrite");
    tx.objectStore("photos").put(photo);
    tx.oncomplete = () => resolve(photo);
  });
}

export function getPhotoURL(photo) {
  return URL.createObjectURL(photo.blob);
}
