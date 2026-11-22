import QRCode from 'qrcode/lib/core/qrcode.js';
import renderer from 'qrcode/lib/renderer/utils.js';
import png from 'pngjs/browser.js';

export default {
  async toDataURL(value, options) {
    const qr = QRCode.create(value, options);
    const config = renderer.getOptions(options);
    const width = renderer.getImageWidth(qr.modules.size, config);
    const image = new png.PNG({ width, height: width });
    renderer.qrToImageData(image.data, qr, config);
    return 'data:image/png;base64,' + png.PNG.sync.write(image).toString('base64');
  }
};
