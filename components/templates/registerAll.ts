// Design Ref: §7 — Register all template types on app startup
import { templateRegistry } from './templateRegistry';

import TextEditor from '../editors/TextEditor';
import ImageEditor from '../editors/ImageEditor';
import VideoEditor from '../editors/VideoEditor';
import WebpageEditor from '../editors/WebpageEditor';

import TextSlide from '../renderers/TextSlide';
import ImageSlide from '../renderers/ImageSlide';
import VideoSlide from '../renderers/VideoSlide';
import WebpageSlide from '../renderers/WebpageSlide';

templateRegistry.register({
  type: 'text',
  label: '텍스트',
  icon: 'T',
  editor: TextEditor,
  renderer: TextSlide,
  defaultSlide: {
    type: 'text',
    title: '새 텍스트 슬라이드',
    content: '',
    backgroundColor: '#1a1a2e',
    duration: 5,
  },
});

templateRegistry.register({
  type: 'image',
  label: '이미지',
  icon: 'I',
  editor: ImageEditor,
  renderer: ImageSlide,
  defaultSlide: {
    type: 'image',
    title: '',
    content: '',
    backgroundColor: '#000000',
    duration: 5,
    mediaOptions: { objectFit: 'cover' },
  },
});

templateRegistry.register({
  type: 'video',
  label: '동영상',
  icon: 'V',
  editor: VideoEditor,
  renderer: VideoSlide,
  defaultSlide: {
    type: 'video',
    title: '',
    content: '',
    backgroundColor: '#000000',
    duration: 30,
    mediaOptions: { autoplay: true, loop: false, muted: true, objectFit: 'cover' },
  },
});

templateRegistry.register({
  type: 'webpage',
  label: '웹페이지',
  icon: 'W',
  editor: WebpageEditor,
  renderer: WebpageSlide,
  defaultSlide: {
    type: 'webpage',
    title: '웹페이지',
    content: 'https://',
    backgroundColor: '#ffffff',
    duration: 30,
  },
});
