// Map link visualisation for the authoring tool.
// - Draws an arrow line for every link between geo passages.
// - When a passage is selected, shows only that passage and the passages it links to / from.
// Loads after the page scripts (on window load) and wraps buildMarkers().
window.addEventListener('load', function () {
  var layer = L.layerGroup().addTo(map);
  var showAll = false;
  var lastSig = '';

  function geoIndex() {
    var g = Object.create(null);
    passages.forEach(function (p, i) {
      if (p.tags && p.tags.indexOf('geo') > -1 && isFinite(p.lat) && isFinite(p.lng)) g[p.name] = i;
    });
    return g;
  }

  function allEdges(g) {
    var out = [];
    passages.forEach(function (p) {
      if (!(p.name in g)) return;
      (p.links || []).forEach(function (t) {
        if (t !== p.name && (t in g)) out.push({ from: p.name, to: t });
      });
    });
    return out;
  }

  function selectedName() {
    return (selectedIndex !== null && passages[selectedIndex]) ? passages[selectedIndex].name : null;
  }

  function arrowIcon(angle, color) {
    return L.divIcon({
      className: '',
      iconSize: [14, 14], iconAnchor: [7, 7],
      html: '<div style="width:14px;height:14px;display:flex;align-items:center;justify-content:center;transform:rotate(' + angle + 'deg);">' +
            '<div style="width:0;height:0;border-left:10px solid ' + color + ';border-top:6px solid transparent;border-bottom:6px solid transparent;"></div></div>'
    });
  }

  function draw() {
    layer.clearLayers();
    var g = geoIndex();
    var sel = selectedName();
    var focused = !!sel && !showAll && (sel in g);
    var edges = allEdges(g);
    var vis = Object.create(null);

    if (focused) {
      vis[sel] = true;
      edges = edges.filter(function (e) {
        if (e.from === sel || e.to === sel) { vis[e.from] = true; vis[e.to] = true; return true; }
        return false;
      });
    }

    edges.forEach(function (e) {
      var a = passages[g[e.from]], b = passages[g[e.to]];
      var color = focused ? (e.from === sel ? '#000080' : '#d2691e') : '#707070';
      L.polyline([[a.lat, a.lng], [b.lat, b.lng]], {
        color: color, weight: focused ? 3 : 1.5, opacity: focused ? 0.9 : 0.6, interactive: false
      }).addTo(layer);
      var pa = map.latLngToLayerPoint([a.lat, a.lng]);
      var pb = map.latLngToLayerPoint([b.lat, b.lng]);
      var angle = Math.atan2(pb.y - pa.y, pb.x - pa.x) * 180 / Math.PI;
      L.marker([(a.lat + b.lat) / 2, (a.lng + b.lng) / 2], {
        icon: arrowIcon(angle, color), interactive: false, keyboard: false
      }).addTo(layer);
    });

    if (focused) {
      Object.keys(markers).forEach(function (i) {
        var p = passages[i];
        if (p && !vis[p.name]) map.removeLayer(markers[i]);
      });
      var drop = [];
      map.eachLayer(function (l) {
        if (!(l instanceof L.Circle)) return;
        var ll = l.getLatLng(), keep = false;
        Object.keys(vis).forEach(function (n) {
          var p = passages[g[n]];
          if (p && p.lat === ll.lat && p.lng === ll.lng) keep = true;
        });
        if (!keep) drop.push(l);
      });
      drop.forEach(function (l) { map.removeLayer(l); });
    }
    updateLegend(focused);
  }

  var legendEl = null;
  function updateLegend(focused) {
    if (!legendEl) return;
    var note = legendEl.querySelector('.ml-note');
    note.innerHTML = focused
      ? '<span style="color:#000080">&#9632;</span> links to &nbsp; <span style="color:#d2691e">&#9632;</span> linked from'
      : 'Select a passage to see only its links';
  }

  var ctl = L.control({ position: 'topright' });
  ctl.onAdd = function () {
    var div = L.DomUtil.create('div', 'ml-ctl');
    div.style.cssText = 'background:#d4d0c8;border:2px solid #808080;padding:4px 8px;font-size:12px;';
    div.innerHTML = '<label style="cursor:pointer;"><input type="checkbox" id="mlShowAll"> Show all links</label><div class="ml-note" style="font-size:11px;margin-top:2px;"></div>';
    L.DomEvent.disableClickPropagation(div);
    div.querySelector('#mlShowAll').addEventListener('change', function (e) {
      showAll = e.target.checked;
      window.buildMarkers();
    });
    legendEl = div;
    return div;
  };
  ctl.addTo(map);

  var origBuild = window.buildMarkers;
  window.buildMarkers = function () {
    origBuild.apply(this, arguments);
    try { draw(); } catch (e) { console.error('maplinks', e); }
  };

  function signature() {
    var g = geoIndex();
    return JSON.stringify([selectedName(), showAll, allEdges(g),
      Object.keys(g).map(function (n) { var p = passages[g[n]]; return [n, p.lat, p.lng]; })]);
  }
  setInterval(function () {
    var s;
    try { s = signature(); } catch (e) { return; }
    if (s !== lastSig) { lastSig = s; window.buildMarkers(); }
  }, 700);

  window.buildMarkers();
});
