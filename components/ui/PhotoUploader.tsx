'use client'

import { useRef, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, Camera, ImagePlus, X } from 'lucide-react'

interface Props {
  photos: File[]
  previews: string[]
  onAdd: (files: File[]) => void
  onRemove: (index: number) => void
  max?: number
  minHint?: number
  cols?: 3 | 4
}

export function PhotoUploader({ photos, previews, onAdd, onRemove, max = 5, minHint }: Props) {
  const browseRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const remaining = max - photos.length
  const canAdd    = remaining > 0

  const onDrop = useCallback((accepted: File[]) => {
    onAdd(accepted.slice(0, remaining))
  }, [remaining, onAdd])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    maxSize: 10 * 1024 * 1024,
    disabled: !canAdd,
    noClick: true, // we use our own buttons; drag-drop still works
  })

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, remaining)
    if (files.length) onAdd(files)
    e.target.value = ''
  }

  return (
    <div className="space-y-3">

      {/* Previews — shown as links (open the image in a new tab) */}
      {previews.length > 0 && (
        <div className="space-y-1">
          {previews.map((src, i) => (
            <div key={i} className="flex items-center justify-between gap-2">
              <a href={src} target="_blank" rel="noopener noreferrer" className="text-sm text-[#C6A35D] underline truncate min-w-0">Photo {i + 1}</a>
              <button type="button" onClick={() => onRemove(i)} className="shrink-0 text-[var(--text-faint)] hover:text-red-500">
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Minimum hint */}
      {minHint && photos.length > 0 && photos.length < minHint && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Add {minHint - photos.length} more photo{minHint - photos.length !== 1 ? 's' : ''} — minimum {minHint} required.
        </p>
      )}

      {canAdd && (
        <div
          {...getRootProps()}
          className={`rounded-xl border-2 border-dashed transition-colors ${
            isDragActive
              ? 'border-brand-400 bg-brand-50 dark:bg-brand-900/20'
              : 'border-gray-300 dark:border-gray-600'
          }`}
        >
          {/* Hidden dropzone input for drag-drop */}
          <input {...getInputProps()} />

          <div className="p-3 space-y-2">
            {isDragActive ? (
              <div className="flex items-center justify-center gap-2 py-4 text-brand-600 dark:text-brand-400">
                <Upload size={20} />
                <span className="text-sm font-medium">Drop photos here…</span>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {/* Browse Gallery */}
                <button
                  type="button"
                  onClick={() => browseRef.current?.click()}
                  className="flex items-center justify-center gap-2 py-3.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-200 hover:border-[#C6A35D] hover:text-[#C6A35D] transition-colors"
                >
                  <ImagePlus size={16} />
                  Browse
                </button>

                {/* Take Photo */}
                <button
                  type="button"
                  onClick={() => cameraRef.current?.click()}
                  className="flex items-center justify-center gap-2 py-3.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-200 hover:border-[#C6A35D] hover:text-[#C6A35D] transition-colors"
                >
                  <Camera size={16} />
                  Take Photo
                </button>
              </div>
            )}

            <p className="text-center text-xs text-gray-400 dark:text-gray-500">
              {remaining} of {max} slot{remaining !== 1 ? 's' : ''} remaining · drag &amp; drop also works
            </p>
          </div>
        </div>
      )}

      {/* Hidden file inputs */}
      <input
        ref={browseRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleInput}
        className="hidden"
      />
      {/* capture="environment" opens the rear camera directly on mobile */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleInput}
        className="hidden"
      />
    </div>
  )
}
