import { useRef, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { ConfirmDialog, ErrorNote, Field, Loading, Modal, SmartImage, useToast } from '../../components/ui';
import { IconUpload } from '../../components/icons';

export default function MediaLibrary() {
  const { data, loading, error, reload } = useApi<any[]>('/api/admin/media');
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [altEdit, setAltEdit] = useState<any | null>(null);
  const [replacing, setReplacing] = useState<any | null>(null);
  const [deleting, setDeleting] = useState<any | null>(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('alt', file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '));
        await api.upload('/api/admin/media', fd);
      }
      toast('success', `${files.length} image(s) uploaded and validated.`);
      reload();
    } catch (e) {
      toast('error', e instanceof ApiError ? e.message : 'Upload failed.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const replace = async (files: FileList | null) => {
    if (!files?.length || !replacing) return;
    const fd = new FormData();
    fd.append('file', files[0]);
    try {
      await api.upload(`/api/admin/media/${replacing.id}/replace`, fd);
      toast('success', 'Image replaced — all references updated in place.');
      setReplacing(null);
      reload();
    } catch (e) {
      toast('error', e instanceof ApiError ? e.message : 'Replace failed.');
    }
  };

  const del = async () => {
    try {
      await api.del(`/api/admin/media/${deleting.id}`);
      toast('success', 'Image deleted.');
      setDeleting(null);
      reload();
    } catch (e) {
      toast('error', e instanceof ApiError ? e.message : 'Delete failed.');
      setDeleting(null);
    }
  };

  return (
    <>
      <div className="admin-topbar">
        <h1>Media Library</h1>
        <span className="spacer" />
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden onChange={(e) => upload(e.target.files)} />
        <button className="btn btn-primary btn-sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
          {uploading ? <span className="spinner" /> : <IconUpload width={15} height={15} />} Upload images
        </button>
      </div>
      <p className="muted small">JPEG, PNG, WebP, or GIF up to 8 MB. Files are validated by magic bytes on the server. Images in use cannot be deleted accidentally.</p>
      {loading ? <Loading /> : null}
      {error ? <ErrorNote message={error} retry={reload} /> : null}
      {data ? (
        <div className="media-grid">
          {data.map((m) => (
            <div className="media-tile" key={m.id}>
              <SmartImage src={m.url} alt={m.alt || m.filename} />
              <div className="meta">
                <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.alt || m.filename}</div>
                <div>{(m.size / 1024).toFixed(0)} KB · {m.mime.split('/')[1]}</div>
                {m.usages?.length ? <div style={{ color: 'var(--amber)' }}>used: {m.usages.join(', ')}</div> : <div style={{ color: 'var(--ink-3)' }}>unused</div>}
                <div className="row" style={{ marginTop: 6, gap: 6 }}>
                  <button className="btn btn-sm btn-outline" onClick={() => setAltEdit(m)}>Alt text</button>
                  <button className="btn btn-sm btn-outline" onClick={() => setReplacing(m)}>Replace</button>
                  <button className="btn btn-sm btn-danger" onClick={() => setDeleting(m)}>Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {altEdit ? (
        <Modal title="Edit alt text & filename" onClose={() => setAltEdit(null)} footer={
          <button className="btn btn-primary" onClick={() => api.patch(`/api/admin/media/${altEdit.id}`, { alt: altEdit.alt, filename: altEdit.filename }).then(() => { toast('success', 'Saved.'); setAltEdit(null); reload(); }).catch((e) => toast('error', e.message))}>Save</button>
        }>
          <Field label="Alt text (accessibility)" hint="Describe the image for screen readers.">
            <input className="input" value={altEdit.alt} onChange={(e) => setAltEdit({ ...altEdit, alt: e.target.value })} />
          </Field>
          <Field label="Display filename"><input className="input" value={altEdit.filename} onChange={(e) => setAltEdit({ ...altEdit, filename: e.target.value })} /></Field>
        </Modal>
      ) : null}
      {replacing ? (
        <Modal title={`Replace "${replacing.alt || replacing.filename}"`} onClose={() => setReplacing(null)}>
          <p className="muted small">The new file keeps the same references everywhere it is used.</p>
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => replace(e.target.files)} />
        </Modal>
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title="Delete this image?"
          body={deleting.usages?.length ? <>Still used by: <strong>{deleting.usages.join(', ')}</strong>. Deletion will be blocked unless references are removed first.</> : 'The file and its database record will be removed.'}
          danger confirmLabel="Delete" onCancel={() => setDeleting(null)} onConfirm={del}
        />
      ) : null}
    </>
  );
}
