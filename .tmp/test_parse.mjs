import { generateJSON } from '@tiptap/html'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import Image from '@tiptap/extension-image'
import Youtube from '@tiptap/extension-youtube'

const CustomResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: '100%',
        parseHTML: (element) => element.getAttribute('data-width') || element.style.width || element.getAttribute('width') || '100%',
      },
    }
  }
})

const CustomResizableYoutube = Youtube.extend({})

const html = '<img src="test.jpg" style="width: 50%;" /><div data-youtube-video><iframe src="https://www.youtube.com/embed/123"></iframe></div>'

const json = generateJSON(html, [Document, Paragraph, Text, CustomResizableImage, CustomResizableYoutube])
console.log(JSON.stringify(json, null, 2))
