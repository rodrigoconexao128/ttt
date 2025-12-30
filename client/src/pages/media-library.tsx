import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getAuthToken } from "@/lib/supabase";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, Edit2, Upload, Music, Image as ImageIcon, Video, FileText, Play, RefreshCw, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

interface AgentMedia {
  id: string;
  userId: string;
  name: string;
  mediaType: "audio" | "image" | "video" | "document";
  storageUrl: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  durationSeconds?: number;
  description: string;
  whenToUse?: string;
  caption?: string; // Legenda enviada junto com imagem/vídeo
  transcription?: string;
  isActive: boolean;
  sendAlone: boolean;
  displayOrder: number;
  wapiMediaId?: string;
  createdAt: string;
  updatedAt: string;
}

interface MediaFormData {
  name: string;
  mediaType: "audio" | "image" | "video" | "document";
  storageUrl: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  durationSeconds?: number;
  description: string;
  whenToUse?: string;
  caption?: string; // Legenda enviada junto com imagem/vídeo
  transcription?: string;
  isActive: boolean;
  sendAlone: boolean; // Enviar sozinha ou pode combinar com outras
  displayOrder: number;
}

const initialFormData: MediaFormData = {
  name: "",
  mediaType: "audio",
  storageUrl: "",
  fileName: "",
  description: "",
  whenToUse: "",
  caption: "",
  transcription: "",
  isActive: true,
  sendAlone: false, // Pode combinar com outras por padrão
  displayOrder: 0,
};

const mediaTypeIcons = {
  audio: Music,
  image: ImageIcon,
  video: Video,
  document: FileText,
};

const mediaTypeLabels = {
  audio: "Áudio",
  image: "Imagem",
  video: "Vídeo",
  document: "Documento",
};

export default function MediaLibrary() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [mediaList, setMediaList] = useState<AgentMedia[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingMedia, setEditingMedia] = useState<AgentMedia | null>(null);
  const [formData, setFormData] = useState<MediaFormData>(initialFormData);
  const [transcribing, setTranscribing] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Fetch media list
  const fetchMediaList = useCallback(async () => {
    try {
      setLoading(true);
      const token = await getAuthToken();
      const response = await fetch("/api/agent/media", {
        credentials: "include",
        headers: token ? { "Authorization": `Bearer ${token}` } : {},
      });
      
      if (response.ok) {
        const data = await response.json();
        setMediaList(data);
      } else {
        throw new Error("Failed to fetch media");
      }
    } catch (error) {
      console.error("Error fetching media:", error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar a biblioteca de mídias.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchMediaList();
  }, [fetchMediaList]);

  // Selecionar arquivo (upload ocorrerá no salvar)
  const handleFileUpload = (fileParam?: File) => {
    const file = fileParam || selectedFile;
    console.log('[MediaLibrary] handleFileUpload called with:', file?.name);
    if (!file) {
      toast({
        title: "Nenhum arquivo selecionado",
        description: "Por favor, selecione um arquivo para enviar.",
        variant: "destructive",
      });
      return;
    }

    console.log('[MediaLibrary] Setting selectedFile and clearing storageUrl');
    setSelectedFile(file);
    setFormData(prev => ({
      ...prev,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      storageUrl: "", // força novo upload no salvar
    }));
  };

  // Faz upload real (chamado dentro do salvar)
  const uploadSelectedFile = async () => {
    if (!selectedFile) return null;

    setUploadingFile(true);
    try {
      const token = await getAuthToken();
      const formDataUpload = new FormData();
      formDataUpload.append("file", selectedFile);

      const response = await fetch("/api/agent/media/upload", {
        method: "POST",
        credentials: "include",
        headers: token ? { "Authorization": `Bearer ${token}` } : {},
        body: formDataUpload,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to upload");
      }

      const data = await response.json();
      
      // Se houver transcrição automática (para áudios), preencher no formulário
      if (data.transcription && !formData.transcription) {
        setFormData(prev => ({
          ...prev,
          transcription: data.transcription
        }));
        toast({
          title: "Transcrição",
          description: "Áudio transcrito automaticamente"
        });
      }
      
      setSelectedFile(null);
      return data;
    } finally {
      setUploadingFile(false);
    }
  };

  // Drag and drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log('[MediaLibrary] handleFileSelect called', e.target.files);
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      console.log('[MediaLibrary] File selected:', file.name, file.size, file.type);
      handleFileUpload(file);
    }
    // Reset input para permitir selecionar o mesmo arquivo novamente
    e.target.value = '';
  };

  // Handle form changes
  const handleInputChange = (field: keyof MediaFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Normalize name to uppercase with underscores
  const normalizeName = (name: string) => {
    return name.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');
  };


  // Open dialog for new media
  const handleNewMedia = () => {
    setEditingMedia(null);
    setFormData({
      ...initialFormData,
      displayOrder: mediaList.length,
    });
    setIsDialogOpen(true);
  };

  // Open dialog for editing
  const handleEditMedia = (media: AgentMedia) => {
    setEditingMedia(media);
    setSelectedFile(null); // Reset arquivo selecionado ao abrir edição
    setFormData({
      name: media.name,
      mediaType: media.mediaType,
      storageUrl: media.storageUrl,
      fileName: media.fileName || "",
      fileSize: media.fileSize,
      mimeType: media.mimeType || "",
      durationSeconds: media.durationSeconds,
      description: media.description,
      whenToUse: media.whenToUse || "",
      caption: media.caption || "",
      transcription: media.transcription || "",
      isActive: media.isActive,
      sendAlone: media.sendAlone || false,
      displayOrder: media.displayOrder,
    });
    setIsDialogOpen(true);
  };

  // Save media
  const handleSave = async () => {
    try {
      setSaving(true);
      
      // Validate
      if (!formData.name.trim()) {
        toast({
          title: "Erro",
          description: "O nome da mídia é obrigatório.",
          variant: "destructive",
        });
        return;
      }
      
      if (!formData.description.trim()) {
        toast({
          title: "Erro",
          description: "A descrição da mídia é obrigatória.",
          variant: "destructive",
        });
        return;
      }

      // Se não houver URL atual, exige arquivo selecionado
      if (!formData.storageUrl.trim() && !selectedFile) {
        toast({
          title: "Erro",
          description: "Selecione um arquivo para enviar.",
          variant: "destructive",
        });
        return;
      }

      // Upload se houver arquivo pendente
      let uploadData = null as null | {
        storageUrl: string;
        fileName: string;
        fileSize?: number;
        mimeType?: string;
        mediaType?: string;
      };

      if (selectedFile) {
        uploadData = await uploadSelectedFile();

        if (!uploadData) {
          throw new Error("Falha ao enviar o arquivo.");
        }

        setFormData(prev => ({
          ...prev,
          storageUrl: uploadData!.storageUrl,
          fileName: uploadData!.fileName,
          fileSize: uploadData!.fileSize,
          mimeType: uploadData!.mimeType || prev.mimeType,
          mediaType: (uploadData!.mediaType as any) || prev.mediaType,
        }));
      }

      const dataToSave = {
        ...formData,
        storageUrl: uploadData?.storageUrl || formData.storageUrl,
        fileName: uploadData?.fileName || formData.fileName,
        fileSize: uploadData?.fileSize ?? formData.fileSize,
        mimeType: uploadData?.mimeType || formData.mimeType,
        mediaType: (uploadData?.mediaType as any) || formData.mediaType,
        name: normalizeName(formData.name),
      };

      // Remove campos que o backend não aceita ou que podem causar problemas de validação
      const cleanedData = Object.fromEntries(
        Object.entries(dataToSave).filter(([_, v]) => v !== undefined && v !== null && v !== "")
      );

      console.log("[MediaLibrary] handleSave - dataToSave:", JSON.stringify(cleanedData, null, 2));

      const url = editingMedia 
        ? `/api/agent/media/${editingMedia.id}`
        : "/api/agent/media";
      
      const method = editingMedia ? "PUT" : "POST";
      const token = await getAuthToken();

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify(cleanedData),
      });

      if (response.ok) {
        toast({
          title: "Sucesso",
          description: editingMedia 
            ? "Mídia atualizada com sucesso!" 
            : "Mídia adicionada com sucesso!",
        });
        setIsDialogOpen(false);
        fetchMediaList();
      } else {
        const error = await response.json();
        throw new Error(error.message || "Failed to save");
      }
    } catch (error: any) {
      console.error("Error saving media:", error);
      toast({
        title: "Erro",
        description: error.message || "Não foi possível salvar a mídia.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // Delete media
  const handleDelete = async (media: AgentMedia) => {
    if (!confirm(`Tem certeza que deseja excluir "${media.name}"?`)) {
      return;
    }

    try {
      const token = await getAuthToken();
      const response = await fetch(`/api/agent/media/${media.id}`, {
        method: "DELETE",
        credentials: "include",
        headers: token ? { "Authorization": `Bearer ${token}` } : {},
      });

      if (response.ok) {
        toast({
          title: "Sucesso",
          description: "Mídia excluída com sucesso!",
        });
        fetchMediaList();
      } else {
        throw new Error("Failed to delete");
      }
    } catch (error) {
      console.error("Error deleting media:", error);
      toast({
        title: "Erro",
        description: "Não foi possível excluir a mídia.",
        variant: "destructive",
      });
    }
  };

  // Transcribe audio
  const handleTranscribe = async () => {
    if (!formData.storageUrl || formData.mediaType !== "audio") {
      return;
    }

    try {
      setTranscribing(true);
      const token = await getAuthToken();
      
      const response = await fetch("/api/agent/media/transcribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({
          audioUrl: formData.storageUrl,
          mimeType: formData.mimeType || "audio/ogg",
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setFormData(prev => ({
          ...prev,
          transcription: data.transcription,
          description: prev.description || data.transcription.substring(0, 200),
        }));
        toast({
          title: "Sucesso",
          description: "Áudio transcrito com sucesso!",
        });
      } else {
        throw new Error("Failed to transcribe");
      }
    } catch (error) {
      console.error("Error transcribing:", error);
      toast({
        title: "Erro",
        description: "Não foi possível transcrever o áudio.",
        variant: "destructive",
      });
    } finally {
      setTranscribing(false);
    }
  };

  // Render media card
  const renderMediaCard = (media: AgentMedia) => {
    const Icon = mediaTypeIcons[media.mediaType];
    
    return (
      <Card key={media.id} className={`relative ${!media.isActive ? 'opacity-50' : ''}`}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-primary/10">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base font-mono">{media.name}</CardTitle>
                <Badge variant="secondary" className="text-xs mt-1">
                  {mediaTypeLabels[media.mediaType]}
                </Badge>
              </div>
            </div>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleEditMedia(media)}
              >
                <Edit2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleDelete(media)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-2">
            {media.description}
          </p>
          {media.whenToUse && (
            <p className="text-xs text-muted-foreground italic">
              📌 Usar quando: {media.whenToUse}
            </p>
          )}
          {media.mediaType === "audio" && media.storageUrl && (
            <div className="mt-3">
              <audio controls className="w-full h-8" src={media.storageUrl}>
                Seu navegador não suporta áudio.
              </audio>
            </div>
          )}
          {media.mediaType === "image" && media.storageUrl && (
            <div className="mt-3">
              <img 
                src={media.storageUrl} 
                alt={media.name}
                className="w-full h-24 object-cover rounded-md"
              />
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Biblioteca de Mídias</h2>
          <p className="text-muted-foreground">
            Adicione áudios, imagens e vídeos que o agente pode enviar automaticamente durante as conversas.
          </p>
        </div>
        <Button onClick={handleNewMedia}>
          <Plus className="h-4 w-4 mr-2" />
          Nova Mídia
        </Button>
      </div>

      {/* Empty state */}
      {mediaList.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="p-4 rounded-full bg-primary/10 mb-4">
              <Upload className="h-8 w-8 text-primary" />
            </div>
            <h3 className="font-semibold mb-2">Nenhuma mídia cadastrada</h3>
            <p className="text-sm text-muted-foreground text-center max-w-md mb-4">
              Adicione áudios, imagens ou vídeos que o agente pode enviar automaticamente durante as conversas.
            </p>
            <Button onClick={handleNewMedia}>
              <Plus className="h-4 w-4 mr-2" />
              Adicionar primeira mídia
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Media grid */}
      {mediaList.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {mediaList.map(renderMediaCard)}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingMedia ? "Editar Mídia" : "Nova Mídia"}
            </DialogTitle>
            <DialogDescription>
              Configure a mídia e sua descrição para que o agente saiba quando usá-la.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Nome da Mídia (ID)</Label>
              <Input
                id="name"
                placeholder="Ex: AUDIO_PRECO, IMG_BOAS_VINDAS"
                value={formData.name}
                onChange={(e) => handleInputChange("name", e.target.value)}
                className="font-mono uppercase"
              />
              <p className="text-xs text-muted-foreground">
                Use letras maiúsculas e underscores. Este nome será usado no prompt do agente.
              </p>
            </div>

            {/* Media Type */}
            <div className="space-y-2">
              <Label>Tipo de Mídia</Label>
              <Select
                value={formData.mediaType}
                onValueChange={(value) => handleInputChange("mediaType", value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="audio">🎵 Áudio</SelectItem>
                  <SelectItem value="image">🖼️ Imagem</SelectItem>
                  <SelectItem value="video">🎬 Vídeo</SelectItem>
                  <SelectItem value="document">📄 Documento</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* File Upload */}
            <div className="space-y-2">
              <Label>Upload de Arquivo</Label>
              <input
                type="file"
                id="file-upload"
                ref={fileInputRef}
                className="hidden"
                accept={
                  formData.mediaType === "audio" ? "audio/*,.ogg,.opus,.mp3,.m4a,.wav" :
                  formData.mediaType === "image" ? "image/*,.jpg,.jpeg,.png,.gif,.webp" :
                  formData.mediaType === "video" ? "video/*,.mp4,.webm,.mov" :
                  "*/*"
                }
                onChange={handleFileSelect}
              />

              <div
                className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                  dragActive ? "border-primary/70 bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
                }`}
                onClick={() => fileInputRef.current?.click()}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                role="button"
              >
                {uploadingFile ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Enviando arquivo...</p>
                  </div>
                ) : selectedFile ? (
                  <div className="flex flex-col items-center gap-2">
                    {formData.mediaType === "audio" && <Music className="h-8 w-8 text-primary" />}
                    {formData.mediaType === "image" && <ImageIcon className="h-8 w-8 text-primary" />}
                    {formData.mediaType === "video" && <Video className="h-8 w-8 text-primary" />}
                    {formData.mediaType === "document" && <FileText className="h-8 w-8 text-primary" />}
                    <p className="text-sm font-medium">{selectedFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB — será enviado ao salvar
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        fileInputRef.current?.click();
                      }}
                    >
                      Trocar arquivo
                    </Button>
                  </div>
                ) : formData.storageUrl ? (
                  <div className="flex flex-col items-center gap-2">
                    <Check className="h-8 w-8 text-green-500" />
                    <p className="text-sm text-green-600 font-medium">Arquivo pronto</p>
                    <p className="text-xs text-muted-foreground break-all max-w-full px-4">
                      {formData.storageUrl}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        fileInputRef.current?.click();
                      }}
                    >
                      Trocar arquivo
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <p className="text-sm font-medium">Clique ou arraste para selecionar</p>
                    <p className="text-xs text-muted-foreground">
                      {formData.mediaType === "audio" && "Formatos: OGG, OPUS, MP3, M4A, WAV (max 16MB)"}
                      {formData.mediaType === "image" && "Formatos: JPG, PNG, GIF, WEBP (max 5MB)"}
                      {formData.mediaType === "video" && "Formatos: MP4, WEBM, MOV (max 64MB)"}
                      {formData.mediaType === "document" && "Qualquer formato (max 100MB)"}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Preview (Audio only) */}
            {formData.mediaType === "audio" && formData.storageUrl && (
              <div className="space-y-2">
                <Label>Preview</Label>
                <div className="p-3 border rounded-lg bg-muted/30">
                  <audio controls className="w-full mb-2" src={formData.storageUrl}>
                    Seu navegador não suporta áudio.
                  </audio>
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        fileInputRef.current?.click();
                      }}
                    >
                      <RefreshCw className="h-4 w-4 mr-1" />
                      Trocar Áudio
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setFormData(prev => ({ ...prev, storageUrl: "", fileName: "", transcription: "" }));
                        setSelectedFile(null);
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Remover
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Preview (Image only) */}
            {formData.mediaType === "image" && formData.storageUrl && (
              <div className="space-y-2">
                <Label>Preview</Label>
                <div className="border rounded-lg overflow-hidden">
                  <img 
                    src={formData.storageUrl} 
                    alt="Preview"
                    className="w-full max-h-48 object-contain"
                  />
                  <div className="flex gap-2 p-2 bg-muted/30 border-t">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        fileInputRef.current?.click();
                      }}
                    >
                      <RefreshCw className="h-4 w-4 mr-1" />
                      Trocar Imagem
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="flex-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setFormData(prev => ({ ...prev, storageUrl: "", fileName: "" }));
                        setSelectedFile(null);
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Remover
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Preview (Video only) */}
            {formData.mediaType === "video" && formData.storageUrl && (
              <div className="space-y-2">
                <Label>Preview</Label>
                <div className="border rounded-lg overflow-hidden">
                  <video 
                    controls 
                    className="w-full max-h-48 object-contain"
                    src={formData.storageUrl}
                  />
                  <div className="flex gap-2 p-2 bg-muted/30 border-t">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        fileInputRef.current?.click();
                      }}
                    >
                      <RefreshCw className="h-4 w-4 mr-1" />
                      Trocar Vídeo
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="flex-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setFormData(prev => ({ ...prev, storageUrl: "", fileName: "" }));
                        setSelectedFile(null);
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Remover
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Preview (Document only) */}
            {formData.mediaType === "document" && formData.storageUrl && (
              <div className="space-y-2">
                <Label>Arquivo</Label>
                <div className="p-3 border rounded-lg bg-muted/30 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-muted-foreground" />
                    <span className="text-sm truncate max-w-[200px]">{formData.fileName || "Documento"}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        fileInputRef.current?.click();
                      }}
                    >
                      <RefreshCw className="h-4 w-4 mr-1" />
                      Trocar
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setFormData(prev => ({ ...prev, storageUrl: "", fileName: "" }));
                        setSelectedFile(null);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Transcription Button (Audio only) */}
            {formData.mediaType === "audio" && formData.storageUrl && (
              <Button
                type="button"
                variant="outline"
                onClick={handleTranscribe}
                disabled={transcribing}
              >
                {transcribing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Transcrever áudio automaticamente
              </Button>
            )}

            {/* Transcription (Audio only) */}
            {formData.mediaType === "audio" && (
              <div className="space-y-2">
                <Label htmlFor="transcription">Transcrição (opcional)</Label>
                <Textarea
                  id="transcription"
                  placeholder="Transcrição do áudio..."
                  value={formData.transcription}
                  onChange={(e) => handleInputChange("transcription", e.target.value)}
                  rows={3}
                />
              </div>
            )}

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Descrição *</Label>
              <Textarea
                id="description"
                placeholder="Ex: Áudio explicando os preços dos produtos principais"
                value={formData.description}
                onChange={(e) => handleInputChange("description", e.target.value)}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                Esta descrição ajuda o agente a entender quando enviar esta mídia.
              </p>
            </div>

            {/* When to Use */}
            <div className="space-y-2">
              <Label htmlFor="whenToUse">Quando usar (opcional)</Label>
              <Textarea
                id="whenToUse"
                placeholder="Ex: Quando o cliente perguntar sobre preços ou valores"
                value={formData.whenToUse}
                onChange={(e) => handleInputChange("whenToUse", e.target.value)}
                rows={2}
              />
              <p className="text-xs text-muted-foreground">
                Instrução adicional para o agente saber quando enviar esta mídia.
              </p>
            </div>

            {/* Caption for Image/Video */}
            {(formData.mediaType === "image" || formData.mediaType === "video") && (
              <div className="space-y-2">
                <Label htmlFor="caption">Legenda da Mídia (opcional)</Label>
                <Textarea
                  id="caption"
                  placeholder="Ex: 📍 Nossa localização! Estamos na Av. Principal, 123"
                  value={formData.caption}
                  onChange={(e) => handleInputChange("caption", e.target.value)}
                  rows={2}
                />
                <p className="text-xs text-muted-foreground">
                  Esta legenda será enviada junto com a imagem/vídeo no WhatsApp. 
                  Diferente da descrição, que é usada apenas pela IA para decidir quando enviar.
                </p>
              </div>
            )}

            {/* Active Switch */}
            <div className="flex items-center justify-between">
              <div>
                <Label>Mídia ativa</Label>
                <p className="text-xs text-muted-foreground">
                  Mídias inativas não aparecem no prompt do agente.
                </p>
              </div>
              <Switch
                checked={formData.isActive}
                onCheckedChange={(checked) => handleInputChange("isActive", checked)}
              />
            </div>

            {/* Send Alone Switch */}
            <div className="flex items-center justify-between">
              <div>
                <Label>Enviar sozinha</Label>
                <p className="text-xs text-muted-foreground">
                  Se ativado, esta mídia NÃO será enviada junto com outras mídias.
                  Use para mídias que devem ser enviadas de forma exclusiva.
                </p>
              </div>
              <Switch
                checked={formData.sendAlone}
                onCheckedChange={(checked) => handleInputChange("sendAlone", checked)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving || uploadingFile}>
              {(saving || uploadingFile) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingMedia ? "Salvar alterações" : "Adicionar mídia"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
