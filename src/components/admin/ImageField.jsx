import db from '@/api/client';

import React, { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Image } from '@/components/ui/image';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import FormField from '@/components/manage/FormField';

const STATIC_IMAGES = [
  { label: 'Hero coach', value: '/images/hero.svg' },
  { label: 'Kampala', value: '/images/kampala.svg' },
  { label: 'Kigali', value: '/images/kigali.svg' },
  { label: 'Bus on road', value: '/images/bus-road.svg' },
  { label: 'Bus park', value: '/images/bus-park.svg' },
  { label: 'Placeholder', value: '/images/placeholder.svg' },
];

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
const MAX_BYTES = 2 * 1024 * 1024;
const CHOOSE_PROMPT = '__choose__';

export default function ImageField({ label, hint, value, onChange }) {
  const fileRef = useRef(null);
  const [uploads, setUploads] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadUploads = useCallback(async () => {
    try {
      const data = await db.uploads.list();
      setUploads(data?.items || []);
    } catch {
      setUploads([]);
    }
  }, []);

  useEffect(() => {
    void loadUploads();
  }, [loadUploads]);

  const handlePick = async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('Use a JPEG, PNG, WebP, or SVG image.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('Image must be 2 MB or smaller.');
      return;
    }
    setBusy(true);
    try {
      const dataBase64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
        reader.onerror = () => reject(new Error('Could not read that file.'));
        reader.readAsDataURL(file);
      });
      const uploaded = await db.uploads.upload({ contentType: file.type, dataBase64 });
      onChange(uploaded.url);
      await loadUploads();
    } catch (err) {
      setError(err?.message || 'Upload failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    const filename = String(value || '')
      .split('/')
      .pop();
    if (!filename) return;
    if (!window.confirm('Delete this uploaded image?')) return;
    setBusy(true);
    setError('');
    try {
      await db.uploads.remove(filename);
      if (value === `/uploads/${filename}`) onChange('');
      await loadUploads();
    } catch (err) {
      setError(err?.message || 'Could not delete the image.');
    } finally {
      setBusy(false);
    }
  };

  const isUploaded = typeof value === 'string' && value.startsWith('/uploads/');

  return (
    <FormField label={label} hint={hint}>
      <div className="space-y-2">
        <div className="flex gap-2">
          <Input
            value={value || ''}
            onChange={(event) => onChange(event.target.value)}
            placeholder="/images/hero.svg or /uploads/…"
          />
          <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
            {busy ? 'Uploading…' : 'Upload'}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPTED_TYPES.join(',')}
            className="hidden"
            onChange={handlePick}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={value || undefined} onValueChange={onChange}>
            <SelectTrigger className="w-60">
              <SelectValue placeholder="Choose an image…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={CHOOSE_PROMPT} disabled>
                Choose an image…
              </SelectItem>
              <SelectGroup>
                <SelectLabel>Site images</SelectLabel>
                {STATIC_IMAGES.map((image) => (
                  <SelectItem key={image.value} value={image.value}>
                    {image.label}
                  </SelectItem>
                ))}
              </SelectGroup>
              {uploads.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Uploaded images</SelectLabel>
                  {uploads.map((item) => (
                    <SelectItem key={item.filename} value={item.url}>
                      {item.filename}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
            </SelectContent>
          </Select>
          {value && (
            <span className="flex items-center gap-2">
              <span className="flex h-10 w-14 overflow-hidden rounded-md border border-border bg-secondary">
                <Image src={value} alt={label || 'Selected image'} className="h-10 w-14 object-cover" />
              </span>
              {isUploaded && (
                <Button type="button" size="sm" variant="ghost" onClick={handleDelete} disabled={busy}>
                  Delete
                </Button>
              )}
            </span>
          )}
        </div>
        {error && <p className="text-[11px] font-medium text-destructive">{error}</p>}
      </div>
    </FormField>
  );
}
