import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAuthToken } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { 
  Package, 
  Plus, 
  Upload, 
  Search, 
  Trash2, 
  Edit2, 
  ChevronLeft, 
  ChevronRight,
  FileSpreadsheet,
  ArrowRight,
  Check,
  X,
  Bot,
  Settings2,
  HelpCircle,
  Download,
  Globe,
  Loader2
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface Product {
  id: string;
  user_id: string;
  name: string;
  price: string | null;
  stock: number;
  description: string | null;
  category: string | null;
  link: string | null;
  sku: string | null;
  unit: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface ProductsResponse {
  products: Product[];
  total: number;
  page: number;
  totalPages: number;
}

interface ProductsConfig {
  id: string;
  user_id: string;
  is_active: boolean;
  send_to_ai: boolean;
  ai_instructions: string;
  created_at: string;
  updated_at: string;
}

interface ImportPreview {
  headers: string[];
  sampleRows: any[][];
  totalRows: number;
  suggestedMapping: Record<string, number | null>;
}

// Campos mapeáveis para importação
const MAPPABLE_FIELDS = [
  { key: 'name', label: 'Nome do Produto', required: true },
  { key: 'price', label: 'Preço' },
  { key: 'stock', label: 'Estoque' },
  { key: 'description', label: 'Descrição' },
  { key: 'category', label: 'Categoria' },
  { key: 'link', label: 'Link/URL' },
  { key: 'sku', label: 'SKU/Código' },
  { key: 'unit', label: 'Unidade' },
];

export default function ProductsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Estados
  const [activeTab, setActiveTab] = useState("produtos");
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  
  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  
  // Import wizard states
  const [importStep, setImportStep] = useState(1);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [columnMapping, setColumnMapping] = useState<Record<string, number | null>>({});
  const [isImporting, setIsImporting] = useState(false);

  // URL Import state
  const [urlInput, setUrlInput] = useState("");
  const [isAnalyzingUrl, setIsAnalyzingUrl] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    price: '',
    stock: 0,
    description: '',
    category: '',
    link: '',
    sku: '',
    unit: 'un',
    isActive: true,
  });

  // Build query string for products
  const buildProductsUrl = () => {
    const params = new URLSearchParams({
      page: String(currentPage),
      limit: '20',
    });
    if (searchTerm) params.set('search', searchTerm);
    if (categoryFilter !== 'all') params.set('category', categoryFilter);
    if (statusFilter !== 'all') params.set('isActive', statusFilter);
    return `/api/products?${params.toString()}`;
  };

  // Queries
  const { data: productsData, isLoading: isLoadingProducts } = useQuery<ProductsResponse>({
    queryKey: [buildProductsUrl()],
  });

  const { data: categories } = useQuery<string[]>({
    queryKey: ["/api/products/categories"],
  });

  const { data: config, isLoading: isLoadingConfig } = useQuery<ProductsConfig>({
    queryKey: ["/api/products-config"],
  });

  // Helper para invalidar queries de produtos
  const invalidateProductQueries = () => {
    queryClient.invalidateQueries({ predicate: (query) => {
      const key = query.queryKey[0];
      return typeof key === 'string' && key.includes('/api/products');
    }});
  };

  // Mutations
  const createProductMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await apiRequest('POST', '/api/products', data);
      return res.json();
    },
    onSuccess: () => {
      invalidateProductQueries();
      setIsAddModalOpen(false);
      resetForm();
      toast({ title: "Produto criado com sucesso!" });
    },
    onError: () => {
      toast({ title: "Erro ao criar produto", variant: "destructive" });
    },
  });

  const updateProductMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const res = await apiRequest('PUT', `/api/products/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      invalidateProductQueries();
      setIsEditModalOpen(false);
      setEditingProduct(null);
      resetForm();
      toast({ title: "Produto atualizado com sucesso!" });
    },
    onError: () => {
      toast({ title: "Erro ao atualizar produto", variant: "destructive" });
    },
  });

  const deleteProductsMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await apiRequest('DELETE', '/api/products', { ids });
      return res.json();
    },
    onSuccess: () => {
      invalidateProductQueries();
      setSelectedProducts([]);
      setIsDeleteDialogOpen(false);
      toast({ title: "Produto(s) removido(s) com sucesso!" });
    },
    onError: () => {
      toast({ title: "Erro ao remover produto(s)", variant: "destructive" });
    },
  });

  const updateConfigMutation = useMutation({
    mutationFn: async (data: Partial<ProductsConfig>) => {
      const res = await apiRequest('PUT', '/api/products-config', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products-config"] });
      toast({ title: "Configuração salva!" });
    },
    onError: () => {
      toast({ title: "Erro ao salvar configuração", variant: "destructive" });
    },
  });

  // Helpers
  const resetForm = () => {
    setFormData({
      name: '',
      price: '',
      stock: 0,
      description: '',
      category: '',
      link: '',
      sku: '',
      unit: 'un',
      isActive: true,
    });
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      price: product.price || '',
      stock: product.stock,
      description: product.description || '',
      category: product.category || '',
      link: product.link || '',
      sku: product.sku || '',
      unit: product.unit,
      isActive: product.is_active,
    });
    setIsEditModalOpen(true);
  };

  const handleSelectAll = () => {
    if (selectedProducts.length === productsData?.products.length) {
      setSelectedProducts([]);
    } else {
      setSelectedProducts(productsData?.products.map(p => p.id) || []);
    }
  };

  const toggleProductSelection = (id: string) => {
    setSelectedProducts(prev => 
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const formatPrice = (price: string | null) => {
    if (!price) return '-';
    const num = parseFloat(price);
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  // Import handlers
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setImportFile(file);
    setImportStep(2);
    
    // Fazer preview
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const token = await getAuthToken();
      const response = await fetch('/api/products/import/preview', {
        method: 'POST',
        body: formData,
        credentials: 'include',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });
      
      if (!response.ok) throw new Error('Erro ao processar arquivo');
      
      const preview = await response.json();
      setImportPreview(preview);
      setColumnMapping(preview.suggestedMapping);
    } catch (error) {
      toast({ title: "Erro ao processar arquivo", variant: "destructive" });
      setImportStep(1);
      setImportFile(null);
    }
  };

  const handleUrlAnalyze = async () => {
    if (!urlInput) return;
    
    setIsAnalyzingUrl(true);
    try {
      const token = await getAuthToken();
      const res = await fetch('/api/products/import-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ url: urlInput })
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Falha ao analisar URL');
      }
      
      const data = await res.json();
      
      // data.products should be [{ name, price, description, image, link }]
      const headers = ['Nome', 'Preço', 'Descrição', 'Imagem', 'Link', 'Categoria', 'SKU'];
      const rows = data.products.map((p: any) => [
        p.name, 
        p.price, 
        p.description || '', 
        p.image || '', 
        p.link || urlInput,
        p.category || '',
        p.sku || ''
      ]);
      
      // Generate CSV content for the backend to parse
      const csvContent = [
        headers.join(','), 
        ...rows.map((row: any[]) => 
          row.map((cell: any) => {
            const str = String(cell || '');
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
              return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
          }).join(',')
        )
      ].join('\n');
      
      setImportFile(new File([csvContent], "import-website.csv", { type: 'text/csv' }));

      // Pre-map columns
      const mapping = {
        name: 0,
        price: 1,
        description: 2,
        link: 4,
        category: 5,
        sku: 6, 
        stock: null,
        unit: null
      };

      setImportPreview({
        headers,
        sampleRows: rows.slice(0, 10),
        totalRows: rows.length,
        suggestedMapping: mapping
      });

      setColumnMapping(mapping);
      
      setImportStep(2);
      toast({ title: "Site analisado com sucesso!", description: `${rows.length} produtos encontrados.` });
      
    } catch (error: any) {
      console.error('Erro ao analisar site:', error);
      toast({ 
        title: "Erro ao analisar site", 
        description: error.message || "Verifique a URL ou tente novamente.",
        variant: "destructive" 
      });
    } finally {
      setIsAnalyzingUrl(false);
    }
  };

  const handleImport = async () => {
    if (!importFile) return;
    
    setIsImporting(true);
    
    const formData = new FormData();
    formData.append('file', importFile);
    formData.append('columnMapping', JSON.stringify(columnMapping));
    
    try {
      const token = await getAuthToken();
      const response = await fetch('/api/products/import', {
        method: 'POST',
        body: formData,
        credentials: 'include',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.message || 'Erro na importação');
      }
      
      // Usar a função de invalidação que funciona com predicate
      invalidateProductQueries();
      
      // Mensagem detalhada sobre criados vs atualizados
      const insertedMsg = result.inserted > 0 ? `${result.inserted} criado(s)` : '';
      const updatedMsg = result.updated > 0 ? `${result.updated} atualizado(s)` : '';
      const description = [insertedMsg, updatedMsg].filter(Boolean).join(', ') || result.message;
      
      toast({ 
        title: "Importação concluída!",
        description,
      });
      
      // Reset import state
      setIsImportModalOpen(false);
      setImportStep(1);
      setImportFile(null);
      setImportPreview(null);
      setColumnMapping({});
      
    } catch (error: any) {
      toast({ 
        title: "Erro na importação", 
        description: error.message,
        variant: "destructive" 
      });
    } finally {
      setIsImporting(false);
    }
  };

  const resetImport = () => {
    setImportStep(1);
    setImportFile(null);
    setImportPreview(null);
    setColumnMapping({});
    setUrlInput("");
    setIsAnalyzingUrl(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="container mx-auto py-6 px-4 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Package className="h-6 w-6" />
            Catálogo de Produtos
          </h1>
          <p className="text-muted-foreground mt-1">
            Gerencie seus produtos e preços. A IA usará esta lista para responder sobre produtos.
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/* Toggle IA - Acesso Rápido no Topo */}
          {config && (
            <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 rounded-lg border">
              <Bot className={`h-4 w-4 ${config.send_to_ai ? 'text-green-600' : 'text-muted-foreground'}`} />
              <span className="text-sm font-medium">
                Lista {config.send_to_ai ? 'Ativa' : 'Inativa'}
              </span>
              <Switch
                checked={config.send_to_ai || false}
                onCheckedChange={(checked) => updateConfigMutation.mutate({ send_to_ai: checked })}
              />
            </div>
          )}
          
          <Button 
            variant="outline" 
            onClick={() => {
              setIsImportModalOpen(true);
              resetImport();
            }}
          >
            <Upload className="h-4 w-4 mr-2" />
            Importar Planilha
          </Button>
          <Button onClick={() => {
            resetForm();
            setIsAddModalOpen(true);
          }}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Produto
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="produtos">
            <Package className="h-4 w-4 mr-2" />
            Produtos ({productsData?.total || 0})
          </TabsTrigger>
          <TabsTrigger value="configuracoes">
            <Settings2 className="h-4 w-4 mr-2" />
            Configurações
          </TabsTrigger>
        </TabsList>

        <TabsContent value="produtos">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col md:flex-row gap-4 justify-between">
                {/* Search and filters */}
                <div className="flex flex-1 gap-2">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar produtos..."
                      value={searchTerm}
                      onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="pl-9"
                    />
                  </div>
                  <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setCurrentPage(1); }}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas categorias</SelectItem>
                      {categories?.map((cat) => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setCurrentPage(1); }}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="true">Ativos</SelectItem>
                      <SelectItem value="false">Inativos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {/* Bulk actions */}
                {selectedProducts.length > 0 && (
                  <Button 
                    variant="destructive" 
                    size="sm"
                    onClick={() => setIsDeleteDialogOpen(true)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Excluir ({selectedProducts.length})
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingProducts ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : productsData?.products.length === 0 ? (
                <div className="text-center py-12">
                  <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">Nenhum produto cadastrado</h3>
                  <p className="text-muted-foreground mb-4">
                    Adicione seus produtos manualmente ou importe de uma planilha.
                  </p>
                  <div className="flex justify-center gap-2">
                    <Button variant="outline" onClick={() => {
                      setIsImportModalOpen(true);
                      resetImport();
                    }}>
                      <FileSpreadsheet className="h-4 w-4 mr-2" />
                      Importar Planilha
                    </Button>
                    <Button onClick={() => {
                      resetForm();
                      setIsAddModalOpen(true);
                    }}>
                      <Plus className="h-4 w-4 mr-2" />
                      Adicionar Produto
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          <Checkbox 
                            checked={selectedProducts.length === productsData?.products.length && productsData.products.length > 0}
                            onCheckedChange={handleSelectAll}
                          />
                        </TableHead>
                        <TableHead>Produto</TableHead>
                        <TableHead>Categoria</TableHead>
                        <TableHead className="text-right">Preço</TableHead>
                        <TableHead className="text-center">Estoque</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                        <TableHead className="w-24"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {productsData?.products.map((product) => (
                        <TableRow key={product.id}>
                          <TableCell>
                            <Checkbox 
                              checked={selectedProducts.includes(product.id)}
                              onCheckedChange={() => toggleProductSelection(product.id)}
                            />
                          </TableCell>
                          <TableCell>
                            <div>
                              <div className="font-medium">{product.name}</div>
                              {product.sku && (
                                <div className="text-xs text-muted-foreground">SKU: {product.sku}</div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {product.category ? (
                              <Badge variant="outline">{product.category}</Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatPrice(product.price)}
                          </TableCell>
                          <TableCell className="text-center">
                            {product.stock > 0 ? (
                              <span>{product.stock} {product.unit}</span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant={product.is_active ? "default" : "secondary"}>
                              {product.is_active ? "Ativo" : "Inativo"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={() => openEditModal(product)}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {/* Pagination */}
                  {productsData && productsData.totalPages > 1 && (
                    <div className="flex items-center justify-between mt-4">
                      <div className="text-sm text-muted-foreground">
                        Mostrando {((currentPage - 1) * 20) + 1} a {Math.min(currentPage * 20, productsData.total)} de {productsData.total}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={currentPage === 1}
                          onClick={() => setCurrentPage(p => p - 1)}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={currentPage === productsData.totalPages}
                          onClick={() => setCurrentPage(p => p + 1)}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="configuracoes">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5" />
                Integração com a IA
              </CardTitle>
              <CardDescription>
                Configure como a IA deve usar sua lista de produtos nas conversas.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {isLoadingConfig ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="space-y-0.5">
                      <Label className="text-base">Módulo de Produtos Ativo</Label>
                      <p className="text-sm text-muted-foreground">
                        Ativa o módulo de produtos no sistema
                      </p>
                    </div>
                    <Switch
                      checked={config?.is_active || false}
                      onCheckedChange={(checked) => updateConfigMutation.mutate({ is_active: checked })}
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="space-y-0.5">
                      <Label className="text-base">Enviar Produtos para a IA</Label>
                      <p className="text-sm text-muted-foreground">
                        A IA terá acesso à lista de produtos para responder perguntas
                      </p>
                    </div>
                    <Switch
                      checked={config?.send_to_ai || false}
                      onCheckedChange={(checked) => updateConfigMutation.mutate({ send_to_ai: checked })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Instruções para a IA</Label>
                    <Textarea
                      placeholder="Instruções sobre como a IA deve usar os produtos..."
                      value={config?.ai_instructions || ''}
                      onChange={(e) => updateConfigMutation.mutate({ ai_instructions: e.target.value })}
                      disabled={!config?.is_active || !config?.send_to_ai}
                      rows={4}
                    />
                    <p className="text-xs text-muted-foreground">
                      Diga para a IA como ela deve usar a lista de produtos (ex: informar preços, disponibilidade, etc.)
                    </p>
                  </div>

                  <div className="p-4 bg-muted rounded-lg">
                    <div className="flex items-start gap-3">
                      <HelpCircle className="h-5 w-5 text-muted-foreground mt-0.5" />
                      <div className="text-sm">
                        <p className="font-medium mb-1">Como funciona?</p>
                        <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                          <li>Quando ativado, a lista de produtos ativos é enviada junto com cada mensagem à IA</li>
                          <li>A IA poderá responder perguntas sobre preços, disponibilidade e detalhes dos produtos</li>
                          <li>Produtos inativos não são enviados à IA</li>
                          <li>Mantenha a lista atualizada para respostas precisas</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Product Modal */}
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo Produto</DialogTitle>
            <DialogDescription>
              Adicione um novo produto ao seu catálogo.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Nome do Produto *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ex: Camiseta Básica M"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="price">Preço</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  placeholder="0,00"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="stock">Estoque</Label>
                <Input
                  id="stock"
                  type="number"
                  value={formData.stock}
                  onChange={(e) => setFormData({ ...formData, stock: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="category">Categoria</Label>
                <Input
                  id="category"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  placeholder="Ex: Vestuário"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="sku">SKU/Código</Label>
                <Input
                  id="sku"
                  value={formData.sku}
                  onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  placeholder="Ex: CAM-001"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Descrição do produto..."
                rows={3}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="link">Link/URL</Label>
              <Input
                id="link"
                value={formData.link}
                onChange={(e) => setFormData({ ...formData, link: e.target.value })}
                placeholder="https://..."
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
              />
              <Label>Produto ativo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddModalOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={() => createProductMutation.mutate(formData)}
              disabled={!formData.name || createProductMutation.isPending}
            >
              {createProductMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Product Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Produto</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">Nome do Produto *</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-price">Preço</Label>
                <Input
                  id="edit-price"
                  type="number"
                  step="0.01"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-stock">Estoque</Label>
                <Input
                  id="edit-stock"
                  type="number"
                  value={formData.stock}
                  onChange={(e) => setFormData({ ...formData, stock: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-category">Categoria</Label>
                <Input
                  id="edit-category"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-sku">SKU/Código</Label>
                <Input
                  id="edit-sku"
                  value={formData.sku}
                  onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-description">Descrição</Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-link">Link/URL</Label>
              <Input
                id="edit-link"
                value={formData.link}
                onChange={(e) => setFormData({ ...formData, link: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
              />
              <Label>Produto ativo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={() => editingProduct && updateProductMutation.mutate({ id: editingProduct.id, data: formData })}
              disabled={!formData.name || updateProductMutation.isPending}
            >
              {updateProductMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Modal */}
      <Dialog open={isImportModalOpen} onOpenChange={(open) => {
        setIsImportModalOpen(open);
        if (!open) resetImport();
      }}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0">
          <div className="p-6 pb-2">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                Importar Produtos
              </DialogTitle>
              <DialogDescription>
                {importStep === 1 && "Escolha o método de importação."}
                {importStep === 2 && "Configure o mapeamento das colunas."}
                {importStep === 3 && "Revise e confirme a importação."}
              </DialogDescription>
            </DialogHeader>
          </div>
          
          <div className="px-6 py-4 flex-1 overflow-y-auto">
            {/* Progress indicator */}
            <div className="flex items-center justify-center mb-6">
              {[1, 2, 3].map((step) => (
                <div key={step} className="flex items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    importStep >= step 
                      ? 'bg-primary text-primary-foreground' 
                      : 'bg-muted text-muted-foreground'
                  }`}>
                    {importStep > step ? <Check className="h-4 w-4" /> : step}
                  </div>
                  {step < 3 && (
                    <div className={`w-12 h-1 ${importStep > step ? 'bg-primary' : 'bg-muted'}`} />
                  )}
                </div>
              ))}
            </div>

            {/* Step 1: File selection or URL */}
            {importStep === 1 && (
              <div className="space-y-8 py-4">
                {/* Option 1: File */}
                <div className="text-center">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed rounded-lg p-8 cursor-pointer hover:bg-muted/50 transition-colors"
                  >
                    <FileSpreadsheet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-2">Importar de Planilha</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Arraste seu arquivo Excel/CSV ou clique para selecionar
                    </p>
                    <Button variant="outline">
                      <Upload className="h-4 w-4 mr-2" />
                      Selecionar Arquivo
                    </Button>
                  </div>
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">Ou importar de site</span>
                  </div>
                </div>

                {/* Option 2: URL */}
                <div className="border rounded-lg p-6 space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Globe className="h-5 w-5 text-primary" />
                    <h3 className="text-lg font-medium">Extrair de Site (Beta)</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Insira a URL de uma categoria ou lista de produtos. A IA irá identificar os produtos automaticamente.
                  </p>
                  <div className="flex gap-2">
                    <Input 
                      placeholder="https://sualoja.com.br/categoria/produtos" 
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      disabled={isAnalyzingUrl}
                    />
                    <Button onClick={handleUrlAnalyze} disabled={isAnalyzingUrl || !urlInput}>
                      {isAnalyzingUrl && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {isAnalyzingUrl ? "Analisando..." : "Analisar Site"}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Column mapping */}
            {importStep === 2 && importPreview && (
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  Arquivo: <span className="font-medium">{importFile?.name}</span> ({importPreview.totalRows} linhas)
                </div>
                
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-48">Campo do Sistema</TableHead>
                        <TableHead>Coluna da Planilha</TableHead>
                        <TableHead>Amostra</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {MAPPABLE_FIELDS.map((field) => (
                        <TableRow key={field.key}>
                          <TableCell className="font-medium">
                            {field.label}
                            {field.required && <span className="text-destructive ml-1">*</span>}
                          </TableCell>
                          <TableCell>
                            <Select 
                              value={columnMapping[field.key]?.toString() || 'none'}
                              onValueChange={(v) => setColumnMapping({
                                ...columnMapping,
                                [field.key]: v === 'none' ? null : parseInt(v)
                              })}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Selecione..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Não mapear</SelectItem>
                                {importPreview.headers.map((header, idx) => (
                                  <SelectItem key={idx} value={idx.toString()}>
                                    {header || `Coluna ${idx + 1}`}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {columnMapping[field.key] !== null && columnMapping[field.key] !== undefined && importPreview.sampleRows[0] && (
                              <span className="truncate max-w-[200px] block">
                                {importPreview.sampleRows[0][columnMapping[field.key] as number] || '-'}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* Step 3: Confirmation */}
            {importStep === 3 && importPreview && (
              <div className="space-y-4">
                <div className="bg-muted p-4 rounded-lg">
                  <h4 className="font-medium mb-2">Resumo da Importação</h4>
                  <ul className="space-y-1 text-sm">
                    <li>Arquivo: {importFile?.name}</li>
                    <li>Total de produtos: {importPreview.totalRows}</li>
                    <li>Campos mapeados: {Object.values(columnMapping).filter(v => v !== null).length}</li>
                  </ul>
                </div>
                
                <div className="p-4 border rounded-lg">
                  <h4 className="font-medium mb-2">Prévia (primeiras 3 linhas)</h4>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {MAPPABLE_FIELDS.filter(f => columnMapping[f.key] !== null).map((field) => (
                            <TableHead key={field.key}>{field.label}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {importPreview.sampleRows.slice(0, 3).map((row, rowIdx) => (
                          <TableRow key={rowIdx}>
                            {MAPPABLE_FIELDS.filter(f => columnMapping[f.key] !== null).map((field) => (
                              <TableCell key={field.key}>
                                {row[columnMapping[field.key] as number] || '-'}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          <DialogFooter>
            {importStep > 1 && (
              <Button variant="outline" onClick={() => setImportStep(s => s - 1)}>
                <ChevronLeft className="h-4 w-4 mr-2" />
                Voltar
              </Button>
            )}
            <div className="flex-1" />
            {importStep === 2 && (
              <Button onClick={() => setImportStep(3)} disabled={columnMapping.name === null}>
                Continuar
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            )}
            {importStep === 3 && (
              <Button onClick={handleImport} disabled={isImporting}>
                {isImporting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                    Importando...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Confirmar Importação
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Produtos</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir {selectedProducts.length} produto(s)? 
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => deleteProductsMutation.mutate(selectedProducts)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteProductsMutation.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
