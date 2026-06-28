// Register Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(console.error);
}

// Data Sets
const busData = {
  "BL-01": {
    name: "බලංගොඩ-වේලිඔය-හම්බෙගමුව", distance: 34,
    down: [
      {departure: 'Balangoda', depTime: '06:00', destination:'Welioya', endTime:'07:30', service:'ශ්‍රී ලංගම'},
      {departure: 'Balangoda', depTime: '07:30', destination:'Welioya', endTime:'09:00', service:'ශ්‍රී ලංගම'},
      {departure: 'Balangoda', depTime: '08:30', destination:'Welioya', endTime:'10:00', service:'පුද්ගලික'},
      {departure: 'Balangoda', depTime: '09:00', destination:'Welioya', endTime:'10:30', service:'ශ්‍රී ලංගම'},
      {departure: 'Balangoda', depTime: '09:30', destination:'Welioya', endTime:'11:00', service:'පුද්ගලික'},
      {departure: 'Balangoda', depTime: '13:30', destination:'Welioya', endTime:'15:00', service:'ශ්‍රී ලංගම'}
    ],
    up: [
      {departure:'Welioya', depTime:'06:00', destination:'Balangoda', endTime:'07:30', service:'ශ්‍රී ලංගම'},
      {departure:'Welioya', depTime:'08:30', destination:'Balangoda', endTime:'10:00', service:'පුද්ගලික'},
      {departure:'Welioya', depTime:'13:30', destination:'Balangoda', endTime:'15:00', service:'ශ්‍රී ලංගම'}
    ]
  },
  "BL-02": {
    name: "බලංගොඩ-වැලිපතයාය-කල්තොට", distance: 39,
    down: [{departure:'Balangoda', depTime:'07:30', destination:'kaltota', endTime:'09:00', service:'ශ්‍රී ලංගම'}],
    up: [{departure:'kaltota', depTime:'07:30', destination:'Balangoda', endTime:'09:00', service:'ශ්‍රී ලංගම'}]
  },
  "BL-03": {
    name: "බලංගොඩ-රජවක-මුල්ගම", distance: 17,
    down: [{departure:'Balangoda', depTime:'08:30', destination:'Mulgama', endTime:'10:00', service:'පුද්ගලික'}],
    up: [{departure:'Mulgama', depTime:'08:30', destination:'Balangoda', endTime:'10:00', service:'පුද්ගලික'}]
  }
};

const busStops = {
  "Balangoda": 0, "Kirimatitenna": 3.2, "Depalamulla": 8.1, "Bowatta": 10,
  "Rajavaka": 12, "Nawaneliya": 17, "Molamure": 18, "Tanjantenna": 22,
  "Kaltota": 29, "Welioya": 34
};

const balangodaCenter = {lat: 6.6610, lng: 80.7700};
let map, fromMarker, toMarker, mapMode = null;
let simPolyline = null, simMarker = null, simCoords = [], simTimer = null, simIndex = 0;
let currentResult = null;

// Initialize Map
function initMap() {
  map = L.map('map').setView([balangodaCenter.lat, balangodaCenter.lng], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

  map.on('click', (e) => {
    if (mapMode === 'from') {
      if (fromMarker) map.removeLayer(fromMarker);
      fromMarker = L.marker(e.latlng).addTo(map).bindPopup('ගමනාරමිභය').openPopup();
      addCustomStop('fromSelect', e.latlng, 'ගමනාරමිභය (මැප්)');
    } else if (mapMode === 'to') {
      if (toMarker) map.removeLayer(toMarker);
      toMarker = L.marker(e.latlng).addTo(map).bindPopup('ගමනාන්තය').openPopup();
      addCustomStop('toSelect', e.latlng, 'ගමනාන්තය (මැප්)');
    }
    setMapMode(null);
  });

  // Fullscreen interactions
  let lastTap = 0;
  map.getContainer().addEventListener('click', () => {
    const now = Date.now();
    if (now - lastTap < 350) {
      document.body.classList.toggle('fullscreen');
      setTimeout(() => map.invalidateSize(), 350);
    }
    lastTap = now;
  });
}

function setMapMode(mode) {
  mapMode = mode;
  document.getElementById('setFromBtn').classList.toggle('active', mode === 'from');
  document.getElementById('setToBtn').classList.toggle('active', mode === 'to');
}

function addCustomStop(selectId, latlng, labelText) {
  const select = document.getElementById(selectId);
  const val = `CUSTOM_${latlng.lat}_${latlng.lng}`;
  const opt = document.createElement('option');
  opt.value = val;
  opt.textContent = labelText;
  opt.selected = true;
  select.appendChild(opt);
}

// Helpers
function haversine(a, b) {
  const R = 6371;
  const toRad = v => v * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lng - a.lng);
  const c = 2 * Math.atan2(Math.sqrt(Math.sin(dLat/2)**2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon/2)**2), Math.sqrt(1 - (Math.sin(dLat/2)**2)));
  return R * c;
}

function parseTimeToDate(tStr) {
  const [hh, mm] = tStr.split(':').map(Number);
  const d = new Date();
  d.setHours(hh || 0, mm || 0, 0, 0);
  return d;
}

// core algorithm
function doFindBus() {
  const routeKey = document.getElementById('routeSelect').value;
  const fromVal = document.getElementById('fromSelect').value;
  const toVal = document.getElementById('toSelect').value;
  const timeInput = document.getElementById('timeInput').value;

  let fromDist = fromVal.startsWith('CUSTOM_') ? haversine(balangodaCenter, {lat: parseFloat(fromVal.split('_')[1]), lng: parseFloat(fromVal.split('_')[2])}) : busStops[fromVal];
  let toDist = toVal.startsWith('CUSTOM_') ? haversine(balangodaCenter, {lat: parseFloat(toVal.split('_')[1]), lng: parseFloat(toVal.split('_')[2])}) : busStops[toVal];

  const direction = fromDist > toDist ? 'up' : 'down';
  const route = busData[routeKey];
  if (!route || !route[direction]) return;

  const compareTime = timeInput ? parseTimeToDate(timeInput) : new Date();
  
  let arrivals = route[direction].map((b, idx) => {
    const dep = parseTimeToDate(b.depTime);
    const end = parseTimeToDate(b.endTime);
    const tripMs = end - dep;
    const proportion = fromDist / route.distance;
    const arrival = new Date(dep.getTime() + (proportion * tripMs));
    return { index: idx, bus: b, arrival };
  });

  arrivals.sort((a,b) => a.arrival - b.arrival);
  let foundIndex = arrivals.findIndex(a => a.arrival >= compareTime);
  if(foundIndex === -1) foundIndex = arrivals.length - 1;

  currentResult = { arrivals, idx: foundIndex };
  renderResult();
}

function renderResult() {
  if (!currentResult || currentResult.arrivals.length === 0) return;
  const item = currentResult.arrivals[currentResult.idx];
  const b = item.bus;

  document.getElementById('resultTitle').textContent = `${b.departure} → ${b.destination}`;
  document.getElementById('resultTime').textContent = item.arrival.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  
  const pill = document.getElementById('servicePill');
  pill.textContent = b.service;
  pill.className = `pill ${b.service.includes('පුද්ගලික') ? 'private' : 'sltb'}`;
}

// Simulator Setup
function handleGpx(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function() {
    const parser = new DOMParser();
    const xml = parser.parseFromString(reader.result, "application/xml");
    const pts = Array.from(xml.querySelectorAll('trkpt'));
    simCoords = pts.map(p => [parseFloat(p.getAttribute('lat')), parseFloat(p.getAttribute('lon'))]);
    
    if (simPolyline) map.removeLayer(simPolyline);
    simPolyline = L.polyline(simCoords, {color: '#ff6b6b'}).addTo(map);
    map.fitBounds(simPolyline.getBounds());
  };
  reader.readAsText(file);
}

function startSimulator() {
  if (simCoords.length < 2) return alert('කරුණාකර GPX ගොනුවක් තෝරන්න.');
  if (simMarker) map.removeLayer(simMarker);
  simIndex = 0;
  
  simMarker = L.marker(simCoords[0], {
    icon: L.divIcon({html: '<i class="fa fa-bus"></i>', className: 'bus-sim-icon', iconSize: [24, 24]})
  }).addTo(map);

  runSimulationStep();
}

function runSimulationStep() {
  if (simIndex >= simCoords.length - 1) return;
  simTimer = setTimeout(() => {
    simIndex++;
    simMarker.setLatLng(simCoords[simIndex]);
    runSimulationStep();
  }, 300);
}

// Dynamic Wire-up Event Handlers
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  document.getElementById('searchBtn').addEventListener('click', doFindBus);
  document.getElementById('setFromBtn').addEventListener('click', () => setMapMode('from'));
  document.getElementById('setToBtn').addEventListener('click', () => setMapMode('to'));
  document.getElementById('centerBtn').addEventListener('click', () => map.setView([balangodaCenter.lat, balangodaCenter.lng], 12));
  document.getElementById('gpxFile').addEventListener('change', handleGpx);
  document.getElementById('startSimBtn').addEventListener('click', startSimulator);
  document.getElementById('stopSimBtn').addEventListener('click', () => clearTimeout(simTimer));
  
  document.getElementById('prevBusBtn').addEventListener('click', () => {
    if (currentResult && currentResult.idx > 0) { currentResult.idx--; renderResult(); }
  });
  document.getElementById('nextBusBtn').addEventListener('click', () => {
    if (currentResult && currentResult.idx < currentResult.arrivals.length - 1) { currentResult.idx++; renderResult(); }
  });
});
