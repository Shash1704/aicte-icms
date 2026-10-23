// Browser stand-in for multer: reads files from the request's FormData into req.files and
// stores their bytes in the demo document store (see ../server.js).
import { HttpError } from '../../../../server/src/cases.js';

let saveBlob = () => {};
export function setBlobSaver(fn) { saveBlob = fn; }

function multer({ limits = {}, fileFilter, storage } = {}) {
  return {
    array: (field, maxCount = 10) => async (req, _res, next) => {
      const form = req._form;
      req.files = [];
      if (!form) return next();
      const files = form.getAll(field).filter((f) => typeof f === 'object');
      if (files.length > maxCount) return next(new HttpError(400, 'Too many files'));
      for (const f of files) {
        if (limits.fileSize && f.size > limits.fileSize) return next(new HttpError(400, `File too large: ${f.name}`));
        const file = { originalname: f.name, mimetype: f.type || 'application/octet-stream', size: f.size };
        let accepted = true;
        let filterError = null;
        if (fileFilter) fileFilter(req, file, (err, ok) => { filterError = err; accepted = ok; });
        if (filterError) return next(filterError);
        if (!accepted) continue;
        file.filename = await new Promise((resolve) => storage.filename(req, file, (_e, name) => resolve(name)));
        saveBlob(file.filename, new Uint8Array(await f.arrayBuffer()), file.mimetype);
        req.files.push(file);
      }
      next();
    },
  };
}
multer.diskStorage = (opts) => opts;
export default multer;
