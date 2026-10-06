/* Classroom extras for the authoring tool (loaded after the main script by the build).
   1. "Linked from Start" checkbox, stored per passage as an @fromstart line.
      The build step turns each @fromstart into a [[link]] inside Start and removes the line.
   2. "Linked from" (incoming links): shows which passages link here and lets you add or remove them. */
(function () {
  'use strict';
  if (typeof parseTwee !== 'function' || typeof renderEditor !== 'function') return;

  const style = document.createElement('style');
  style.textContent =
    '.link-chip.incoming{background:#555}' +
    '.start-check{display:flex;align-items:center;gap:8px;font-size:13px;text-transform:none;font-weight:bold;min-height:32px}' +
    '.start-check input{width:20px;height:20px}';
  document.head.appendChild(style);

  const origParse = parseTwee;
  parseTwee = function (text) {
    const flags = [];
    const cleaned = text.split(/^:: /m).filter(s => s.trim()).map(block => {
      let flagged = false;
      const kept = block.split('\n').filter(l => {
        if (l.trim() === '@fromstart') { flagged = true; return false; }
        return true;
      }).join('\n');
      flags.push(flagged);
      return ':: ' + (kept.endsWith('\n') ? kept : kept + '\n');
    }).join('');
    const result = origParse(cleaned);
    result.forEach((p, i) => { p.fromStart = !!flags[i]; });
    return result;
  };

  const origSerialize = serializePassage;
  serializePassage = function (p) {
    const s = origSerialize(p);
    if (p.isSpecial || !p.fromStart || p.name === 'Start') return s;
    const nl = s.indexOf('\n');
    return s.slice(0, nl + 1) + '@fromstart\n' + s.slice(nl + 1);
  };

  const origInitLinkedSet = initLinkedSet;
  initLinkedSet = function () {
    origInitLinkedSet();
    passages.forEach(p => { if (p.fromStart) linkedNodeSet.add(p.name); });
  };

  const startPassage = () => passages.find(q => q.name === 'Start');
  const isFromStart = p => !!p.fromStart || !!(startPassage() && (startPassage().links || []).includes(p.name));
  const incomingOf = name => passages.filter(q => q.name !== name && Array.isArray(q.links) && q.links.includes(name));

  function setFromStart(p, on) {
    p.fromStart = on;
    if (!on) {
      const s = startPassage();
      if (s && Array.isArray(s.links) && s.links.includes(p.name)) s.links = s.links.filter(n => n !== p.name);
    }
    updateRawPreview();
    setStatus(on ? '"' + p.name + '" will be linked from Start. Apply + Save to share it.'
                 : '"' + p.name + '" is no longer linked from Start. Save to share it.');
  }

  function renderIncoming() {
    const p = passages[selectedIndex];
    const box = document.getElementById('incomingChips');
    if (!p || !box) return;
    box.innerHTML = '';
    const makeChip = (label, onRemove) => {
      const chip = document.createElement('span');
      chip.className = 'link-chip incoming';
      chip.appendChild(document.createTextNode(label));
      const x = document.createElement('button');
      x.className = 'remove-link'; x.title = 'Remove this link'; x.textContent = '\u2715';
      x.addEventListener('click', onRemove);
      chip.appendChild(x);
      box.appendChild(chip);
    };
    if (isFromStart(p) && p.name !== 'Start') {
      makeChip('Start', () => { setFromStart(p, false); renderIncoming(); const c = document.getElementById('f_fromstart'); if (c) c.checked = false; });
    }
    incomingOf(p.name).forEach(src => {
      makeChip(src.name, () => {
        src.links = src.links.filter(n => n !== p.name);
        renderIncoming();
        setStatus('"' + src.name + '" no longer links to "' + p.name + '". Save to share it.');
      });
    });
    if (!box.children.length) {
      const none = document.createElement('span');
      none.className = 'link-hint'; none.textContent = 'Nothing links here yet, so readers cannot reach this passage.';
      box.appendChild(none);
    }
  }

  function injectExtras() {
    if (selectedIndex === null || !passages[selectedIndex]) return;
    const linksRow = document.getElementById('linksRow');
    if (!linksRow || document.getElementById('incomingRow')) return;
    const p = passages[selectedIndex];

    const incomingRow = document.createElement('div');
    incomingRow.className = 'field-row'; incomingRow.id = 'incomingRow';
    incomingRow.innerHTML = '<label>Linked From <span style="font-weight:normal;font-style:italic;text-transform:none;">(passages that link to this one)</span></label>' +
      '<div class="link-chips" id="incomingChips"></div>';
    const sel = buildPassageSelect('', selectedIndex, name => {
      if (!name) return;
      const cur = passages[selectedIndex];
      if (name === 'Start') { setFromStart(cur, true); const c = document.getElementById('f_fromstart'); if (c) c.checked = true; }
      else {
        const src = passages.find(q => q.name === name);
        if (!src) return;
        if (!Array.isArray(src.links)) src.links = [];
        if (!src.links.includes(cur.name)) src.links.push(cur.name);
        linkedNodeSet.add(src.name);
        setStatus('"' + src.name + '" now links to "' + cur.name + '". Save to share it (this also saves a change to "' + src.name + '").');
      }
      renderIncoming();
      sel.value = '';
    });
    sel.id = 'incomingAddSel';
    const hint = document.createElement('span');
    hint.className = 'link-hint';
    hint.textContent = 'Pick a passage to make it link here. This edits that passage\u2019s Linked Passages. Tap \u2715 on a chip to remove.';
    incomingRow.appendChild(sel); incomingRow.appendChild(hint);
    linksRow.insertAdjacentElement('afterend', incomingRow);

    if (p.name !== 'Start') {
      const startRow = document.createElement('div');
      startRow.className = 'field-row'; startRow.id = 'startRow';
      startRow.innerHTML = '<label class="start-check"><input type="checkbox" id="f_fromstart"> Linked from Start (readers can begin the story here)</label>' +
        '<span class="link-hint">Tick this if a reader with no history should be able to find this passage. Only tick it for genuine starting points.</span>';
      linksRow.insertAdjacentElement('afterend', startRow);
      const box = startRow.querySelector('#f_fromstart');
      box.checked = isFromStart(p);
      box.addEventListener('change', () => { setFromStart(passages[selectedIndex], box.checked); renderIncoming(); });
    }
    renderIncoming();
  }

  const origRenderEditor = renderEditor;
  renderEditor = function () { origRenderEditor.apply(this, arguments); injectExtras(); };

  if (typeof myUserId !== 'undefined' && myUserId && passages.length) loadFile();
})();

/* Header links: Reader and Help (added to the author title bar at load). */
(function () {
  'use strict';
  const bar = document.querySelector('.titlebar');
  if (!bar || bar.querySelector('[data-nav]')) return;
  const wrap = document.createElement('span');
  wrap.setAttribute('data-nav', '1');
  wrap.style.cssText = 'margin-left:auto;display:flex;gap:14px';
  [['Reader', '../'], ['Help', '../help/']].forEach(([label, href]) => {
    const a = document.createElement('a');
    a.textContent = label;
    a.href = href;
    a.style.cssText = 'color:#fff;font-weight:bold;padding:4px 2px';
    wrap.appendChild(a);
  });
  bar.appendChild(wrap);
})();
