(function () {
  'use strict';
  var FF_VER = '0.12.10', UTIL_VER = '0.12.1', CORE_VER = '0.12.6';
  var CDN = 'https://unpkg.com/@ffmpeg/';
  var MAX_MB = 100;
  var ffmpeg = null, loading = null;

  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src; s.onload = res;
      s.onerror = function () { rej(new Error('script_load')); };
      document.head.appendChild(s);
    });
  }

  async function getFFmpeg(onStatus) {
    if (ffmpeg) return ffmpeg;
    if (loading) return loading;
    loading = (async function () {
      onStatus('Loading audio converter (first time only, ~30 MB)…');
      if (!window.FFmpegWASM) await loadScript(CDN + 'ffmpeg@' + FF_VER + '/dist/umd/ffmpeg.js');
      if (!window.FFmpegUtil) await loadScript(CDN + 'util@' + UTIL_VER + '/dist/umd/index.js');
      var toBlobURL = window.FFmpegUtil.toBlobURL;
      var core = CDN + 'core@' + CORE_VER + '/dist/esm/';
      var inst = new window.FFmpegWASM.FFmpeg();
      await inst.load({
        classWorkerURL: await toBlobURL(CDN + 'ffmpeg@' + FF_VER + '/dist/umd/814.ffmpeg.js', 'text/javascript'),
        coreURL: await toBlobURL(core + 'ffmpeg-core.js', 'text/javascript'),
        wasmURL: await toBlobURL(core + 'ffmpeg-core.wasm', 'application/wasm')
      });
      ffmpeg = inst;
      return inst;
    })();
    try { return await loading; } finally { loading = null; }
  }

  async function videoToAudioFile(file, onStatus) {
    var inst = await getFFmpeg(onStatus);
    var ext = (file.name.match(/\.([a-z0-9]+)$/i) || [, 'mp4'])[1].toLowerCase();
    var inName = 'input.' + ext, outName = 'output.mp3';
    var onProg = function (e) {
      if (e && typeof e.progress === 'number' && e.progress >= 0 && e.progress <= 1) {
        onStatus('Extracting audio… ' + Math.round(e.progress * 100) + '%');
      }
    };
    inst.on('progress', onProg);
    try {
      onStatus('Reading video…');
      await inst.writeFile(inName, await window.FFmpegUtil.fetchFile(file));
      onStatus('Extracting audio…');
      var code = await inst.exec(['-i', inName, '-vn', '-map', '0:a:0', '-ac', '2', '-c:a', 'libmp3lame', '-b:a', '128k', outName]);
      if (code !== 0) throw new Error('no_audio');
      var data = await inst.readFile(outName);
      if (!data || !data.length) throw new Error('no_audio');
      var base = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_') || 'video';
      return new File([data.buffer], base + '.mp3', { type: 'audio/mpeg' });
    } finally {
      inst.off('progress', onProg);
      try { await inst.deleteFile(inName); } catch (_) {}
      try { await inst.deleteFile(outName); } catch (_) {}
    }
  }

  function friendlyVideoError(e) {
    var m = (e && e.message) || '';
    if (m === 'script_load' || /fetch|network|Failed to load|import/i.test(m))
      return 'Could not load the audio converter. Check your connection and try again, or upload an audio file instead.';
    if (m === 'no_audio') return 'We could not find any sound in that video. Try a different clip, or upload an audio file instead.';
    if (/memory|alloc|abort|OOM/i.test(m)) return 'That video is too large for this device. Try trimming it to a shorter clip, then try again.';
    return 'Something went wrong while getting the sound out of that video. Try trimming it shorter, or use a different video, or upload an audio file instead.';
  }

  async function handleVideo(file, ui) {
    if (!file) { showNotice('Choose a video file first.', 'error'); return; }
    if (file.size > MAX_MB * 1024 * 1024) {
      showNotice('That video is over ' + MAX_MB + ' MB. Please trim it to a shorter clip and try again.', 'error'); return;
    }
    var idx = selectedIndex;
    var set = function (t) { ui.progress.style.display = 'block'; ui.progress.textContent = t; setStatus(t); };
    ui.btn.disabled = true;
    try {
      var audioFile = await videoToAudioFile(file, set);
      set('Uploading audio…');
      var url = await uploadMediaFileToGitHub(audioFile, null);
      if (!url) return;
      if (selectedIndex !== idx || !passages[idx]) { showNotice('Audio uploaded, but you changed passages first. Select the passage and upload again.', 'error'); return; }
      passages[idx].audio = url;
      updateRawPreview();
      var nameEl = document.getElementById('audioFilename'); if (nameEl) nameEl.textContent = url;
      var old = document.querySelector('.audio-preview'); if (old) old.remove();
      var a = document.createElement('audio');
      a.className = 'audio-preview'; a.controls = true; a.src = mediaSrc(url);
      var row = document.getElementById('audioRow');
      row.insertBefore(a, row.querySelector('.audio-upload-controls'));
      if (!document.getElementById('removeAudioBtn')) {
        var rm = document.createElement('button');
        rm.className = 'btn danger'; rm.id = 'removeAudioBtn'; rm.textContent = 'Remove';
        rm.addEventListener('click', function () {
          passages[selectedIndex].audio = null; updateRawPreview();
          if (nameEl) nameEl.textContent = 'No audio set';
          var pv = document.querySelector('.audio-preview'); if (pv) pv.remove();
          rm.remove();
          setStatus('Audio removed from passage. Apply + Save to share it.');
        });
        row.querySelector('.audio-upload-controls').appendChild(rm);
      }
      setStatus('Audio extracted and uploaded. Apply + Save to share it.');
      showNotice('Audio extracted from video and uploaded.', 'success');
      ui.input.value = '';
    } catch (e) {
      console.error('video to audio failed', e);
      showNotice(friendlyVideoError(e), 'error');
      setStatus('Video to audio failed.');
    } finally {
      ui.btn.disabled = false;
      ui.progress.style.display = 'none';
    }
  }

  function injectControl() {
    var row = document.getElementById('audioRow');
    if (!row || document.getElementById('videoAudioBox')) return;
    var box = document.createElement('div');
    box.id = 'videoAudioBox';
    box.style.cssText = 'display:flex;flex-direction:column;gap:4px;margin-top:6px;padding-top:6px;border-top:1px dashed #808080;';
    box.innerHTML =
      '<label style="font-weight:bold;font-size:11px;text-transform:uppercase;">Or get audio from a video <span style="font-weight:normal;font-style:italic;text-transform:none;">(only the sound is kept)</span></label>' +
      '<div class="audio-upload-controls">' +
      '<input type="file" id="videoFileInput" accept="video/*,.mp4,.mov,.m4v,.webm" style="font-size:11px;flex:1;">' +
      '<button class="btn primary" id="videoToAudioBtn">Extract audio</button></div>' +
      '<span id="videoAudioProgress" style="font-size:11px;color:#000080;display:none;"></span>' +
      '<span class="hint">Short clips work best. The video itself is not saved.</span>';
    row.appendChild(box);
    var ui = {
      input: box.querySelector('#videoFileInput'),
      btn: box.querySelector('#videoToAudioBtn'),
      progress: box.querySelector('#videoAudioProgress')
    };
    ui.btn.addEventListener('click', function () { handleVideo(ui.input.files && ui.input.files[0], ui); });
  }

  var _renderEditor = renderEditor;
  renderEditor = function () {
    _renderEditor.apply(this, arguments);
    try { injectControl(); } catch (e) { console.error(e); }
  };
})();
