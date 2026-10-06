// Public values only. The anon key is designed to be exposed; Row Level Security protects the data.
window.CLASSROOM_CONFIG = {
  supabaseUrl: 'https://ohmklslddbpkkdovhsqr.supabase.co',
  supabaseAnonKey: 'sb_publishable_FsPedtPgvN3ELfmn5vYiZw_X8qlXTtd'
};

// Optional video-to-audio add-on. Loaded after the page's main script has run
// so it can wrap renderEditor(). Remove this block to disable the feature.
window.addEventListener('load', function () {
  var s = document.createElement('script');
  s.src = 'video2audio.js';
  document.head.appendChild(s);
});
