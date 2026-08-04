'use client'

import { useState, useRef } from 'react'
import {
  FolderOpen, Folder, Upload, Trash2, Download, FileText, FileSpreadsheet,
  Presentation, X, Plus, Search, File, ChevronRight, FolderPlus, Pencil, Check,
  MoveRight,
} from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import {
  useSalesDocuments,
  useSalesFolders,
  useUploadSalesDocument,
  useDeleteSalesDocument,
  useCreateSalesFolder,
  useDeleteSalesFolder,
  useRenameSalesFolder,
  useMoveDocument,
  SALES_DOC_CATEGORIES,
  SalesDocument,
  SalesDocFolder,
} from '@/hooks/use-sales-documents'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const categoryColors: Record<string, string> = {
  price_list:    'bg-blue-100 text-blue-700',
  brochure:      'bg-purple-100 text-purple-700',
  presentation:  'bg-orange-100 text-orange-700',
  product_sheet: 'bg-cyan-100 text-cyan-700',
  contract:      'bg-red-100 text-red-700',
  other:         'bg-gray-100 text-gray-700',
}

function fileIcon(fileName: string) {
  const ext = fileName.split('.').pop()?.toLowerCase()
  if (ext === 'pdf') return <FileText className="h-5 w-5 text-red-500 shrink-0" />
  if (['xls', 'xlsx', 'csv'].includes(ext ?? '')) return <FileSpreadsheet className="h-5 w-5 text-green-600 shrink-0" />
  if (['ppt', 'pptx'].includes(ext ?? '')) return <Presentation className="h-5 w-5 text-orange-500 shrink-0" />
  return <File className="h-5 w-5 text-muted-foreground shrink-0" />
}

function formatBytes(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function SalesDocumentsPage() {
  const { isAdmin } = useAuth()

  // Current folder: null = root
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)

  const { data: allFolders, isLoading: foldersLoading } = useSalesFolders()
  const { data: allDocs, isLoading: docsLoading } = useSalesDocuments()

  // Filter docs for current folder client-side
  const docs = (allDocs ?? []).filter((d) =>
    currentFolderId === null ? !d.folder_id : d.folder_id === currentFolderId
  )

  const upload = useUploadSalesDocument()
  const deleteMutation = useDeleteSalesDocument()
  const createFolder = useCreateSalesFolder()
  const deleteFolder = useDeleteSalesFolder()
  const renameFolder = useRenameSalesFolder()
  const moveDoc = useMoveDocument()

  const [search, setSearch] = useState('')

  // Upload modal
  const [showUpload, setShowUpload] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadName, setUploadName] = useState('')
  const [uploadDesc, setUploadDesc] = useState('')
  const [uploadCategory, setUploadCategory] = useState<string>('other')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Folder actions
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [renamingFolder, setRenamingFolder] = useState<SalesDocFolder | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<SalesDocFolder | null>(null)

  // Document actions
  const [deleteDocTarget, setDeleteDocTarget] = useState<string | null>(null)
  const [movingDoc, setMovingDoc] = useState<SalesDocument | null>(null)
  const [moveTarget, setMoveTarget] = useState<string | null>(null)

  const currentFolder = allFolders?.find((f) => f.id === currentFolderId) ?? null
  const isLoading = foldersLoading || docsLoading
  const docsByFolder = (folderId: string | null) =>
    (allDocs ?? []).filter((d) => folderId === null ? !d.folder_id : d.folder_id === folderId)

  const searchLower = search.toLowerCase().trim()
  const filteredDocs = (docs ?? []).filter((d) =>
    !searchLower ||
    d.name.toLowerCase().includes(searchLower) ||
    d.file_name.toLowerCase().includes(searchLower)
  )

  // Folders shown at root only
  const visibleFolders = currentFolderId === null ? (allFolders ?? []) : []

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadFile(file)
    if (!uploadName) setUploadName(file.name.replace(/\.[^.]+$/, ''))
  }

  async function handleUpload() {
    if (!uploadFile || !uploadName.trim()) return
    await upload.mutateAsync({
      file: uploadFile,
      name: uploadName.trim(),
      description: uploadDesc.trim(),
      category: uploadCategory,
      folderId: currentFolderId,
    })
    setShowUpload(false)
    setUploadFile(null)
    setUploadName('')
    setUploadDesc('')
    setUploadCategory('other')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleCreateFolder() {
    if (!newFolderName.trim()) return
    await createFolder.mutateAsync(newFolderName.trim())
    setShowNewFolder(false)
    setNewFolderName('')
  }

  async function handleRename() {
    if (!renamingFolder || !renameValue.trim()) return
    await renameFolder.mutateAsync({ id: renamingFolder.id, name: renameValue.trim() })
    setRenamingFolder(null)
  }

  async function handleMove() {
    if (!movingDoc) return
    await moveDoc.mutateAsync({ id: movingDoc.id, folderId: moveTarget === '__root__' ? null : moveTarget })
    setMovingDoc(null)
    setMoveTarget(null)
  }

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {/* Breadcrumb */}
          <button
            onClick={() => setCurrentFolderId(null)}
            className={`text-sm font-semibold shrink-0 ${currentFolderId ? 'text-muted-foreground hover:text-foreground' : 'text-foreground'}`}
          >
            Sales Documents
          </button>
          {currentFolder && (
            <>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-semibold truncate">{currentFolder.name}</span>
            </>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          {isAdmin && currentFolderId === null && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowNewFolder(true)}>
              <FolderPlus className="h-4 w-4" />
              <span className="hidden sm:inline">New Folder</span>
            </Button>
          )}
          {isAdmin && (
            <Button size="sm" className="gap-1.5 bg-red-600 hover:bg-red-700" onClick={() => setShowUpload(true)}>
              <Upload className="h-4 w-4" />
              <span className="hidden sm:inline">Upload</span>
            </Button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search documents…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
        </div>
      ) : (
        <>
          {/* Folders (root only) */}
          {!searchLower && visibleFolders.length > 0 && (
            <div className="space-y-1">
              {visibleFolders.map((folder) => (
                <FolderRow
                  key={folder.id}
                  folder={folder}
                  docCount={docsByFolder(folder.id).length}
                  isAdmin={isAdmin}
                  renamingFolder={renamingFolder}
                  renameValue={renameValue}
                  setRenameValue={setRenameValue}
                  onOpen={() => { setCurrentFolderId(folder.id); setSearch('') }}
                  onStartRename={() => { setRenamingFolder(folder); setRenameValue(folder.name) }}
                  onRename={handleRename}
                  onCancelRename={() => setRenamingFolder(null)}
                  onDelete={() => setDeleteFolderTarget(folder)}
                />
              ))}
            </div>
          )}

          {/* Documents */}
          {filteredDocs.length === 0 && visibleFolders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
              <FolderOpen className="h-12 w-12 opacity-20" />
              <p className="font-medium">{currentFolderId ? 'This folder is empty' : 'No documents yet'}</p>
              {isAdmin && (
                <Button size="sm" className="bg-red-600 hover:bg-red-700 mt-1" onClick={() => setShowUpload(true)}>
                  Upload first document
                </Button>
              )}
            </div>
          ) : filteredDocs.length === 0 && !searchLower ? null : (
            <div className="space-y-1">
              {filteredDocs.map((doc) => (
                <DocRow
                  key={doc.id}
                  doc={doc}
                  isAdmin={isAdmin}
                  hasFolders={(allFolders?.length ?? 0) > 0}
                  onDelete={() => setDeleteDocTarget(doc.id)}
                  onMove={() => { setMovingDoc(doc); setMoveTarget(doc.folder_id ?? '__root__') }}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Upload modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <Card size="sm" className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl">
            <CardContent className="pt-5 space-y-4">
              <div className="flex items-center justify-between">
                <p className="font-semibold flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  Upload{currentFolder ? ` to "${currentFolder.name}"` : ''}
                </p>
                <button onClick={() => setShowUpload(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div
                className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer hover:border-red-400 hover:bg-red-50/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                {uploadFile ? (
                  <div className="flex items-center justify-center gap-2">
                    {fileIcon(uploadFile.name)}
                    <div className="text-left">
                      <p className="text-sm font-medium truncate max-w-52">{uploadFile.name}</p>
                      <p className="text-xs text-muted-foreground">{formatBytes(uploadFile.size)}</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">Click to select a file</p>
                    <p className="text-xs text-muted-foreground mt-1">PDF, Word, Excel, PowerPoint…</p>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.png,.jpg,.jpeg"
                  onChange={handleFileChange}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Document name <span className="text-red-500">*</span></Label>
                <Input
                  placeholder="e.g. SPika Price List 2026"
                  value={uploadName}
                  onChange={(e) => setUploadName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Input
                  placeholder="Optional short description"
                  value={uploadDesc}
                  onChange={(e) => setUploadDesc(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={uploadCategory} onValueChange={(v) => v && setUploadCategory(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SALES_DOC_CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Separator />
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowUpload(false)}>Cancel</Button>
                <Button
                  className="flex-1 bg-red-600 hover:bg-red-700"
                  disabled={!uploadFile || !uploadName.trim() || upload.isPending}
                  onClick={handleUpload}
                >
                  {upload.isPending ? 'Uploading…' : 'Upload'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* New folder modal */}
      {showNewFolder && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <Card size="sm" className="w-full max-w-sm">
            <CardContent className="pt-5 space-y-4">
              <p className="font-semibold flex items-center gap-2"><FolderPlus className="h-4 w-4" /> New Folder</p>
              <Input
                placeholder="Folder name"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                autoFocus
              />
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowNewFolder(false)}>Cancel</Button>
                <Button
                  className="flex-1 bg-red-600 hover:bg-red-700"
                  disabled={!newFolderName.trim() || createFolder.isPending}
                  onClick={handleCreateFolder}
                >
                  Create
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Move document modal */}
      {movingDoc && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <Card size="sm" className="w-full max-w-sm">
            <CardContent className="pt-5 space-y-4">
              <p className="font-semibold flex items-center gap-2"><MoveRight className="h-4 w-4" /> Move "{movingDoc.name}"</p>
              <div className="space-y-1">
                <button
                  onClick={() => setMoveTarget('__root__')}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${moveTarget === '__root__' ? 'bg-red-50 text-red-700 font-medium' : 'hover:bg-accent'}`}
                >
                  <FolderOpen className="h-4 w-4" /> Root (no folder)
                </button>
                {(allFolders ?? []).map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setMoveTarget(f.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${moveTarget === f.id ? 'bg-red-50 text-red-700 font-medium' : 'hover:bg-accent'}`}
                  >
                    <Folder className="h-4 w-4" /> {f.name}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setMovingDoc(null)}>Cancel</Button>
                <Button
                  className="flex-1 bg-red-600 hover:bg-red-700"
                  disabled={moveDoc.isPending}
                  onClick={handleMove}
                >
                  Move
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Delete folder confirmation */}
      {deleteFolderTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <Card size="sm" className="w-full max-w-sm">
            <CardContent className="pt-6 space-y-4">
              <p className="font-semibold">Delete folder "{deleteFolderTarget.name}"?</p>
              <p className="text-sm text-muted-foreground">Files inside will be moved to root. The folder will be removed.</p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setDeleteFolderTarget(null)}>Cancel</Button>
                <Button
                  className="flex-1 bg-red-600 hover:bg-red-700"
                  disabled={deleteFolder.isPending}
                  onClick={async () => { await deleteFolder.mutateAsync(deleteFolderTarget.id); setDeleteFolderTarget(null) }}
                >
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Delete document confirmation */}
      {deleteDocTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <Card size="sm" className="w-full max-w-sm">
            <CardContent className="pt-6 space-y-4">
              <p className="font-semibold">Delete this document?</p>
              <p className="text-sm text-muted-foreground">This cannot be undone.</p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setDeleteDocTarget(null)}>Cancel</Button>
                <Button
                  className="flex-1 bg-red-600 hover:bg-red-700"
                  disabled={deleteMutation.isPending}
                  onClick={async () => { await deleteMutation.mutateAsync(deleteDocTarget); setDeleteDocTarget(null) }}
                >
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

function FolderRow({
  folder, docCount, isAdmin, renamingFolder, renameValue, setRenameValue,
  onOpen, onStartRename, onRename, onCancelRename, onDelete,
}: {
  folder: SalesDocFolder
  docCount: number
  isAdmin: boolean
  renamingFolder: SalesDocFolder | null
  renameValue: string
  setRenameValue: (v: string) => void
  onOpen: () => void
  onStartRename: () => void
  onRename: () => void
  onCancelRename: () => void
  onDelete: () => void
}) {
  const isRenaming = renamingFolder?.id === folder.id

  return (
    <div className="flex items-center gap-3 px-3 py-0.5 leading-tight rounded-xl border bg-card hover:bg-accent transition-colors group">
      <button className="flex items-center gap-3 flex-1 min-w-0 text-left" onClick={onOpen}>
        <Folder className="h-5 w-5 text-yellow-500 shrink-0" />
        {isRenaming ? (
          <input
            className="flex-1 border rounded px-2 py-0.5 text-sm bg-background"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => { if (e.key === 'Enter') onRename(); if (e.key === 'Escape') onCancelRename() }}
            autoFocus
          />
        ) : (
          <span className="text-sm font-medium truncate">{folder.name}</span>
        )}
      </button>
      <div className="flex items-center gap-1 shrink-0">
        {isRenaming ? (
          <>
            <button onClick={onRename} className="p-1.5 rounded text-green-600 hover:bg-green-50"><Check className="h-3.5 w-3.5" /></button>
            <button onClick={onCancelRename} className="p-1.5 rounded text-muted-foreground hover:bg-accent"><X className="h-3.5 w-3.5" /></button>
          </>
        ) : isAdmin ? (
          <>
            <button onClick={(e) => { e.stopPropagation(); onStartRename() }} className="opacity-0 group-hover:opacity-100 p-1.5 rounded text-muted-foreground hover:bg-accent transition-opacity">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); onDelete() }} className="opacity-0 group-hover:opacity-100 p-1.5 rounded text-red-500 hover:bg-red-50 transition-opacity">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        ) : null}
        <ChevronRight className="h-4 w-4 text-muted-foreground ml-1" />
      </div>
    </div>
  )
}

function DocRow({ doc, isAdmin, hasFolders, onDelete, onMove }: {
  doc: SalesDocument
  isAdmin: boolean
  hasFolders: boolean
  onDelete: () => void
  onMove: () => void
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-0.5 leading-tight rounded-xl border bg-card hover:bg-accent transition-colors group">
      {fileIcon(doc.file_name)}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{doc.name}</p>
        {doc.description && <p className="text-xs text-muted-foreground truncate">{doc.description}</p>}
        <div className="flex items-center gap-2 mt-0.5">
          <Badge className={`text-xs ${categoryColors[doc.category] ?? categoryColors.other}`}>
            {SALES_DOC_CATEGORIES.find((c) => c.value === doc.category)?.label ?? doc.category}
          </Badge>
          {doc.file_size && <span className="text-xs text-muted-foreground">{formatBytes(doc.file_size)}</span>}
          <span className="text-xs text-muted-foreground">
            {new Date(doc.created_at).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {isAdmin && hasFolders && (
          <button
            onClick={onMove}
            className="opacity-0 group-hover:opacity-100 p-1.5 rounded text-muted-foreground hover:bg-accent transition-opacity"
            title="Move to folder"
          >
            <MoveRight className="h-3.5 w-3.5" />
          </button>
        )}
        <a href={doc.file_url} target="_blank" rel="noopener noreferrer" download>
          <button className="p-1.5 rounded border text-muted-foreground hover:bg-accent transition-colors">
            <Download className="h-3.5 w-3.5" />
          </button>
        </a>
        {isAdmin && (
          <button
            onClick={onDelete}
            className="p-1.5 rounded border border-red-200 text-red-500 hover:bg-red-50 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}
