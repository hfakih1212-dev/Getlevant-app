import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  ListRenderItem,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { SafeAreaView } from 'react-native-safe-area-context'
import Skeleton from '../../components/Skeleton'
import { useFocusEffect } from '@react-navigation/native'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import {
  CATEGORY_OPTIONS,
  CONDITION_LABEL,
  CONDITION_OPTIONS,
  ProductCategory,
  ProductCondition,
} from '../../lib/catalog'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/useAuthStore'
import type { VendorStackParamList } from '../../navigation/RootNavigator'

type Props = NativeStackScreenProps<VendorStackParamList, 'ProductManagement'>

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

const fetchStoreProducts = (storeId: string) =>
  supabase
    .from('products')
    .select('id, name, price_usd, status, condition, product_variants ( stock ), product_images ( url, position )')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })

type StoreProduct = NonNullable<
  Awaited<ReturnType<typeof fetchStoreProducts>>['data']
>[0]

const MAX_PHOTOS = 4

interface ImagePick { uri: string; key: string }
let _imgKey = 0
const mkImgKey = () => String(_imgKey++)

interface VariantDraft {
  key: string
  id?: string   // DB id — present on rows loaded for editing, absent on new rows
  size: string
  color: string
  colorHex: string
  stock: string
}

// Module-level key so each variant gets a stable unique identity
let _vk = 0
const mkVariant = (init?: Partial<Omit<VariantDraft, 'key'>>): VariantDraft => ({
  key: String(_vk++),
  size: '', color: '', colorHex: '', stock: '',
  ...init,
})

interface ExistingImage { id: string; url: string; position: number }

// Public URLs embed the storage path after the bucket segment — needed to
// delete the underlying object when a vendor removes a photo.
function storagePathFromUrl(url: string): string | null {
  const marker = '/product-images/'
  const idx = url.indexOf(marker)
  return idx === -1 ? null : url.slice(idx + marker.length)
}

type ScreenMode = 'list' | 'add' | 'edit'

// Upload picked images to Storage and record their rows, starting at the
// given position so edit-mode additions slot in after existing photos.
async function uploadProductImages(
  storeId: string,
  productId: string,
  picks: ImagePick[],
  startPosition: number,
): Promise<void> {
  for (let i = 0; i < picks.length; i++) {
    const pick     = picks[i]
    const ext      = pick.uri.split('.').pop()?.toLowerCase() ?? 'jpg'
    const position = startPosition + i
    const path     = `${storeId}/${productId}/${position}-${Date.now()}.${ext}`

    const response = await fetch(pick.uri)
    const blob     = await response.blob()
    const { error: uploadErr } = await supabase.storage
      .from('product-images')
      .upload(path, blob, { contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}` })
    if (uploadErr) throw uploadErr

    const { data: { publicUrl } } = supabase.storage
      .from('product-images')
      .getPublicUrl(path)

    const { error: imgRowErr } = await supabase
      .from('product_images')
      .insert({ product_id: productId, url: publicUrl, position })
    if (imgRowErr) throw imgRowErr
  }
}

// ---------------------------------------------------------------------------
// ProductCard
// ---------------------------------------------------------------------------

const ProductCard = React.memo(function ProductCard({
  product,
  onEdit,
}: {
  product: StoreProduct
  onEdit: (productId: string) => void
}) {
  const totalStock   = product.product_variants.reduce((sum, v) => sum + (v.stock ?? 0), 0)
  const variantCount = product.product_variants.length
  const isActive     = product.status === 'active'
  const coverUrl     = [...(product.product_images ?? [])]
    .sort((a, b) => a.position - b.position)[0]?.url ?? null

  return (
    <TouchableOpacity
      style={styles.productCard}
      onPress={() => onEdit(product.id)}
      activeOpacity={0.85}
    >
      <View style={styles.productCardRow}>
        {coverUrl ? (
          <Image source={{ uri: coverUrl }} style={styles.productThumb} resizeMode="cover" />
        ) : (
          <View style={[styles.productThumb, styles.productThumbPlaceholder]} />
        )}

        <View style={styles.productCardBody}>
          <View style={styles.productCardHeader}>
            <Text style={styles.productName} numberOfLines={1}>{product.name}</Text>
            <View style={[styles.statusBadge, isActive ? styles.badgeActive : styles.badgeInactive]}>
              <Text style={[styles.statusBadgeText, isActive ? styles.badgeActiveText : styles.badgeInactiveText]}>
                {isActive ? 'Active' : 'Inactive'}
              </Text>
            </View>
          </View>

          <Text style={styles.productPrice}>
            ${Number(product.price_usd).toFixed(2)} USD
          </Text>

          <View style={styles.productMeta}>
            <Text style={styles.variantCount}>
              {CONDITION_LABEL[product.condition]} · {variantCount} variant{variantCount !== 1 ? 's' : ''}
            </Text>
            <Text style={totalStock > 0 ? styles.stockIn : styles.stockOut}>
              {totalStock > 0 ? `${totalStock} in stock` : 'Out of stock'}
            </Text>
          </View>
        </View>

        <View style={styles.productCardChevron}>
          <Text style={styles.productCardChevronText}>›</Text>
        </View>
      </View>
    </TouchableOpacity>
  )
})

// ---------------------------------------------------------------------------
// ListSkeleton — pulsing placeholder rows shown while inventory loads
// ---------------------------------------------------------------------------

function ListSkeleton() {
  return (
    <View style={styles.listContent}>
      {Array.from({ length: 5 }, (_, i) => (
        <View key={i} style={styles.skeletonRow}>
          <Skeleton style={styles.skeletonThumb} />
          <View style={styles.skeletonBody}>
            <Skeleton style={styles.skeletonLineWide} />
            <Skeleton style={styles.skeletonLineNarrow} />
          </View>
        </View>
      ))}
    </View>
  )
}

// ---------------------------------------------------------------------------
// VariantCard — one draft row inside the Add Product form
// ---------------------------------------------------------------------------

type VariantCardProps = {
  variant: VariantDraft
  index: number
  canRemove: boolean
  onUpdate: (key: string, field: keyof Omit<VariantDraft, 'key' | 'id'>, value: string) => void
  onRemove: (key: string) => void
}

function VariantCard({ variant, index, canRemove, onUpdate, onRemove }: VariantCardProps) {
  return (
    <View style={styles.variantCard}>
      <View style={styles.variantCardHeader}>
        <Text style={styles.variantCardTitle}>Variant {index + 1}</Text>
        {canRemove && (
          <TouchableOpacity
            style={styles.variantRemoveBtn}
            onPress={() => onRemove(variant.key)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.variantRemoveText}>×</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Row 1: Size | Color */}
      <View style={styles.variantRow}>
        <View style={styles.variantField}>
          <Text style={styles.fieldLabel}>Size</Text>
          <TextInput
            style={styles.fieldInput}
            value={variant.size}
            onChangeText={v => onUpdate(variant.key, 'size', v)}
            placeholder="e.g. M"
            placeholderTextColor="#B0A090"
            returnKeyType="next"
          />
        </View>
        <View style={styles.variantField}>
          <Text style={styles.fieldLabel}>Color Name</Text>
          <TextInput
            style={styles.fieldInput}
            value={variant.color}
            onChangeText={v => onUpdate(variant.key, 'color', v)}
            placeholder="e.g. Navy Blue"
            placeholderTextColor="#B0A090"
            returnKeyType="next"
          />
        </View>
      </View>

      {/* Row 2: Hex | Stock */}
      <View style={styles.variantRow}>
        <View style={styles.variantField}>
          <Text style={styles.fieldLabel}>
            Hex <Text style={styles.optionalLabel}>(optional)</Text>
          </Text>
          <TextInput
            style={styles.fieldInput}
            value={variant.colorHex}
            onChangeText={v => onUpdate(variant.key, 'colorHex', v)}
            placeholder="#RRGGBB"
            placeholderTextColor="#B0A090"
            autoCapitalize="characters"
            returnKeyType="next"
          />
        </View>
        <View style={styles.variantField}>
          <Text style={styles.fieldLabel}>Stock</Text>
          <TextInput
            style={styles.fieldInput}
            value={variant.stock}
            onChangeText={v => onUpdate(variant.key, 'stock', v.replace(/[^0-9]/g, ''))}
            placeholder="0"
            placeholderTextColor="#B0A090"
            keyboardType="number-pad"
            returnKeyType="done"
          />
        </View>
      </View>
    </View>
  )
}

// ---------------------------------------------------------------------------
// ProductManagementScreen
// ---------------------------------------------------------------------------

export default function ProductManagementScreen({ navigation, route }: Props) {
  const user = useAuthStore(s => s.user)

  // Store
  const [storeId,   setStoreId]   = useState<string | null>(null)
  const [storeName, setStoreName] = useState('')

  // List
  const [products,    setProducts]    = useState<StoreProduct[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [listError,   setListError]   = useState<string | null>(null)

  // Mode
  const [mode,        setMode]        = useState<ScreenMode>('list')
  const [editingId,   setEditingId]   = useState<string | null>(null)
  const [formLoading, setFormLoading] = useState(false)

  // Add-product form
  const [name,        setName]        = useState('')
  const [description, setDescription] = useState('')
  const [price,       setPrice]       = useState('')
  const [category,    setCategory]    = useState<ProductCategory | null>(null)
  const [condition,   setCondition]   = useState<ProductCondition>('brand_new')
  const [variants,    setVariants]    = useState<VariantDraft[]>(() => [mkVariant()])
  const [imagePicks,  setImagePicks]  = useState<ImagePick[]>([])
  const [saving,      setSaving]      = useState(false)
  const [formError,   setFormError]   = useState<string | null>(null)

  // Edit-mode extras — original variant ids drive the delete diff on save
  const [originalVariantIds, setOriginalVariantIds] = useState<string[]>([])
  const [existingImages,     setExistingImages]     = useState<ExistingImage[]>([])
  const [removedImages,      setRemovedImages]      = useState<ExistingImage[]>([])

  // ---- Data loading ----

  const load = useCallback(async () => {
    if (!user?.id) return
    setListLoading(true)
    setListError(null)

    const { data: store, error: storeErr } = await supabase
      .from('stores')
      .select('id, name')
      .eq('owner_id', user.id)
      .maybeSingle()

    if (storeErr) {
      setListError(storeErr.message)
      setListLoading(false)
      return
    }

    if (!store) {
      navigation.replace('StoreOnboarding')
      setListLoading(false)
      return
    }

    setStoreId(store.id)
    setStoreName(store.name)

    const { data, error: productsErr } = await fetchStoreProducts(store.id)
    if (productsErr) {
      setListError(productsErr.message)
    } else {
      setProducts(data ?? [])
    }

    setListLoading(false)
  }, [user?.id, navigation])

  useFocusEffect(useCallback(() => { load() }, [load]))

  // ---- Form helpers ----

  const resetForm = useCallback(() => {
    setName('')
    setDescription('')
    setPrice('')
    setCategory(null)
    setCondition('brand_new')
    setVariants([mkVariant()])
    setImagePicks([])
    setFormError(null)
    setEditingId(null)
    setOriginalVariantIds([])
    setExistingImages([])
    setRemovedImages([])
  }, [])

  const handlePickImage = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      setFormError('Allow access to your photo library in Settings to add product images.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_PHOTOS,
      quality: 0.75,
      allowsEditing: false,
    })
    if (result.canceled) return
    setImagePicks(prev => {
      const remaining = MAX_PHOTOS - existingImages.length - prev.length
      const toAdd = result.assets.slice(0, remaining).map(a => ({ uri: a.uri, key: mkImgKey() }))
      return [...prev, ...toAdd]
    })
  }, [existingImages.length])

  const removeImage = useCallback((key: string) => {
    setImagePicks(prev => prev.filter(p => p.key !== key))
  }, [])

  // Stage an already-uploaded photo for deletion — applied on save
  const removeExistingImage = useCallback((id: string) => {
    setExistingImages(prev => {
      const target = prev.find(img => img.id === id)
      if (target) setRemovedImages(rm => [...rm, target])
      return prev.filter(img => img.id !== id)
    })
  }, [])

  const openAdd = useCallback(() => {
    resetForm()
    setMode('add')
  }, [resetForm])

  const openEdit = useCallback(async (productId: string) => {
    resetForm()
    setMode('edit')
    setEditingId(productId)
    setFormLoading(true)

    const { data, error } = await supabase
      .from('products')
      .select(
        'id, name, description, price_usd, category, condition, product_variants ( id, size, color, color_hex, stock ), product_images ( id, url, position )',
      )
      .eq('id', productId)
      .maybeSingle()

    if (error || !data) {
      setFormLoading(false)
      setMode('list')
      setListError(error?.message ?? 'Could not load that product.')
      return
    }

    setName(data.name)
    setDescription(data.description ?? '')
    setPrice(String(data.price_usd))
    setCategory(data.category)
    setCondition(data.condition)

    const drafts = data.product_variants.map(v =>
      mkVariant({
        id: v.id,
        size: v.size ?? '',
        color: v.color ?? '',
        colorHex: v.color_hex ?? '',
        stock: String(v.stock),
      }),
    )
    setVariants(drafts.length > 0 ? drafts : [mkVariant()])
    setOriginalVariantIds(data.product_variants.map(v => v.id))
    setExistingImages([...data.product_images].sort((a, b) => a.position - b.position))
    setFormLoading(false)
  }, [resetForm])

  // Deep-link support: ProductManagement can be opened with { productId } to
  // jump straight into edit mode. Consume the param so re-focus doesn't loop.
  const routeProductId = route.params?.productId
  useEffect(() => {
    if (routeProductId) {
      navigation.setParams({ productId: undefined })
      openEdit(routeProductId)
    }
  }, [routeProductId, navigation, openEdit])

  const cancelForm = useCallback(() => {
    resetForm()
    setMode('list')
  }, [resetForm])

  // ---- Variant mutation helpers ----

  const updateVariant = useCallback(
    (key: string, field: keyof Omit<VariantDraft, 'key' | 'id'>, value: string) => {
      setVariants(prev =>
        prev.map(v => v.key === key ? { ...v, [field]: value } : v),
      )
    },
    [],
  )

  const addVariantRow = useCallback(() => {
    setVariants(prev => [...prev, mkVariant()])
  }, [])

  const removeVariantRow = useCallback((key: string) => {
    setVariants(prev => prev.length === 1 ? prev : prev.filter(v => v.key !== key))
  }, [])

  // ---- Save ----

  const handleSave = useCallback(async () => {
    setFormError(null)

    if (!name.trim()) {
      setFormError('Product name is required.')
      return
    }
    const priceNum = parseFloat(price)
    if (isNaN(priceNum) || priceNum <= 0) {
      setFormError('Enter a price greater than 0.')
      return
    }
    if (!category) {
      setFormError('Pick a category so shoppers can find this item.')
      return
    }
    if (!storeId) {
      setFormError('Could not find your store. Go back and reopen Inventory.')
      return
    }

    // A variant row counts if at least one field is filled
    const validVariants = variants.filter(
      v => v.size.trim() || v.color.trim() || v.stock.trim(),
    )
    if (validVariants.length === 0) {
      setFormError('Fill in at least one variant row — add a size, colour, or stock count.')
      return
    }

    setSaving(true)

    try {
      if (mode === 'edit' && editingId) {
        // Step A — update the parent product row
        const { error: updateErr } = await supabase
          .from('products')
          .update({
            name:        name.trim(),
            description: description.trim() || null,
            price_usd:   priceNum,
            category,
            condition,
          })
          .eq('id', editingId)
        if (updateErr) throw updateErr

        // Step B — reconcile modified existing variants (rows keep their DB id)
        const existingRows = validVariants.filter(v => v.id)
        if (existingRows.length > 0) {
          const { error: upsertErr } = await supabase
            .from('product_variants')
            .upsert(
              existingRows.map(v => ({
                id:         v.id,
                product_id: editingId,
                size:       v.size.trim()     || null,
                color:      v.color.trim()    || null,
                color_hex:  v.colorHex.trim() || null,
                stock:      parseInt(v.stock, 10) || 0,
              })),
            )
          if (upsertErr) throw upsertErr
        }

        // Step C — insert newly added variant rows
        const newRows = validVariants.filter(v => !v.id)
        if (newRows.length > 0) {
          const { error: insertErr } = await supabase
            .from('product_variants')
            .insert(
              newRows.map(v => ({
                product_id: editingId,
                size:       v.size.trim()     || null,
                color:      v.color.trim()    || null,
                color_hex:  v.colorHex.trim() || null,
                stock:      parseInt(v.stock, 10) || 0,
              })),
            )
          if (insertErr) throw insertErr
        }

        // Step D — delete variants the vendor removed from the list
        const keptIds = new Set(existingRows.map(v => v.id))
        const removedIds = originalVariantIds.filter(id => !keptIds.has(id))
        if (removedIds.length > 0) {
          const { error: deleteErr } = await supabase
            .from('product_variants')
            .delete()
            .in('id', removedIds)
          if (deleteErr) {
            // order_items.variant_id has no cascade — ordered variants can't go
            if (deleteErr.code === '23503') {
              throw new Error(
                'A removed variant already has orders against it, so it can\'t be deleted. Keep the row and set its stock to 0 instead.',
              )
            }
            throw deleteErr
          }
        }

        // Step E — remove photos the vendor deleted (rows first, then objects;
        // an orphaned object without a row is invisible, the reverse is a 404)
        if (removedImages.length > 0) {
          const { error: imgDelErr } = await supabase
            .from('product_images')
            .delete()
            .in('id', removedImages.map(img => img.id))
          if (imgDelErr) throw imgDelErr

          const paths = removedImages
            .map(img => storagePathFromUrl(img.url))
            .filter((p): p is string => p !== null)
          if (paths.length > 0) {
            await supabase.storage.from('product-images').remove(paths)
          }
        }

        // Step F — upload newly added photos after the last surviving position
        if (imagePicks.length > 0) {
          const nextPos =
            existingImages.reduce((max, img) => Math.max(max, img.position), -1) + 1
          await uploadProductImages(storeId, editingId, imagePicks, nextPos)
        }

        await load()
        setMode('list')
        resetForm()
        return
      }

      // Step A — insert product as draft; flipped to active only after
      // variants + images all land, so a failed step never leaves a broken
      // listing visible in the shopper feed
      const { data: product, error: productErr } = await supabase
        .from('products')
        .insert({
          store_id:    storeId,
          name:        name.trim(),
          description: description.trim() || null,
          price_usd:   priceNum,
          category,
          condition,
          status:      'draft',
        })
        .select('id')
        .single()

      if (productErr) throw productErr

      // Step B — batch-insert variants
      const { error: variantsErr } = await supabase
        .from('product_variants')
        .insert(
          validVariants.map(v => ({
            product_id: product.id,
            size:       v.size.trim()     || null,
            color:      v.color.trim()    || null,
            color_hex:  v.colorHex.trim() || null,
            stock:      parseInt(v.stock, 10) || 0,
          })),
        )

      if (variantsErr) throw variantsErr

      // Step C — upload images and record URLs
      await uploadProductImages(storeId, product.id, imagePicks, 0)

      // Step D — everything landed; publish
      const { error: activateErr } = await supabase
        .from('products')
        .update({ status: 'active' })
        .eq('id', product.id)
      if (activateErr) throw activateErr

      // Success — reload list and return to list mode
      await load()
      setMode('list')
      resetForm()
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }, [name, price, description, category, condition, storeId, variants, imagePicks, mode, editingId, originalVariantIds, existingImages, removedImages, load, resetForm])

  // ---- FlatList helpers ----

  const renderProduct: ListRenderItem<StoreProduct> = useCallback(
    ({ item }) => <ProductCard product={item} onEdit={openEdit} />,
    [openEdit],
  )

  const keyExtractor = useCallback((item: StoreProduct) => item.id, [])

  // ---- Render: Add / Edit form ----

  if (mode !== 'list') {
    const isEdit = mode === 'edit'
    return (
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          style={styles.contentWrap}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Form header */}
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.headerBackBtn}
              onPress={cancelForm}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.headerBackIcon}>←</Text>
            </TouchableOpacity>
            <View style={styles.headerCenter}>
              <Text style={styles.headerTitle}>{isEdit ? 'Edit Product' : 'New Product'}</Text>
              <Text style={styles.headerSub}>{storeName}</Text>
            </View>
            <View style={styles.headerRight} />
          </View>

          {formLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color="#D9552B" />
            </View>
          ) : (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.formScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* ── Product details ── */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Product Details</Text>

              <Text style={styles.inputLabel}>
                Name <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Handwoven Leather Tote"
                placeholderTextColor="#B0A090"
                returnKeyType="next"
              />

              <Text style={styles.inputLabel}>
                Description <Text style={styles.optionalLabel}>(optional)</Text>
              </Text>
              <TextInput
                style={[styles.input, styles.inputMultiline]}
                value={description}
                onChangeText={setDescription}
                placeholder="Describe materials, craftsmanship, care instructions…"
                placeholderTextColor="#B0A090"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />

              <Text style={styles.inputLabel}>
                Price (USD) <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.input}
                value={price}
                onChangeText={setPrice}
                placeholder="0.00"
                placeholderTextColor="#B0A090"
                keyboardType="decimal-pad"
                returnKeyType="next"
              />

              <Text style={styles.inputLabel}>
                Category <Text style={styles.required}>*</Text>
              </Text>
              <View style={styles.categoryRow}>
                {CATEGORY_OPTIONS.map(opt => {
                  const active = category === opt.value
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.categoryChip, active && styles.categoryChipActive]}
                      onPress={() => setCategory(opt.value)}
                      activeOpacity={0.75}
                    >
                      <Text
                        style={[styles.categoryChipText, active && styles.categoryChipActiveText]}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>

              <Text style={styles.inputLabel}>
                Condition <Text style={styles.required}>*</Text>
              </Text>
              <View style={styles.conditionToggle}>
                {CONDITION_OPTIONS.map(opt => {
                  const active = condition === opt.value
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.conditionSegment, active && styles.conditionSegmentActive]}
                      onPress={() => setCondition(opt.value)}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          styles.conditionSegmentText,
                          active && styles.conditionSegmentActiveText,
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </View>

            {/* ── Photos — existing (edit mode) and newly picked share one grid ── */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                Photos{' '}
                <Text style={styles.optionalLabel}>(up to {MAX_PHOTOS})</Text>
              </Text>

              <View style={styles.photoGrid}>
                {existingImages.map(img => (
                  <View key={img.id} style={styles.photoSlot}>
                    <Image source={{ uri: img.url }} style={styles.photoThumb} resizeMode="cover" />
                    <TouchableOpacity
                      style={styles.photoRemoveBtn}
                      onPress={() => removeExistingImage(img.id)}
                      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                    >
                      <Text style={styles.photoRemoveText}>×</Text>
                    </TouchableOpacity>
                  </View>
                ))}

                {imagePicks.map(pick => (
                  <View key={pick.key} style={styles.photoSlot}>
                    <Image source={{ uri: pick.uri }} style={styles.photoThumb} resizeMode="cover" />
                    <TouchableOpacity
                      style={styles.photoRemoveBtn}
                      onPress={() => removeImage(pick.key)}
                      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                    >
                      <Text style={styles.photoRemoveText}>×</Text>
                    </TouchableOpacity>
                  </View>
                ))}

                {existingImages.length + imagePicks.length < MAX_PHOTOS && (
                  <TouchableOpacity
                    style={styles.photoAddSlot}
                    onPress={handlePickImage}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.photoAddIcon}>+</Text>
                    <Text style={styles.photoAddLabel}>Add Photo</Text>
                  </TouchableOpacity>
                )}
              </View>

              {isEdit && removedImages.length > 0 && (
                <Text style={styles.sectionHintPlain}>
                  {removedImages.length} photo{removedImages.length !== 1 ? 's' : ''} will be
                  removed when you save.
                </Text>
              )}
            </View>

            {/* ── Variants ── */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Variants</Text>
              <Text style={styles.sectionHint}>
                Add a row for each size/colour combination you carry.
              </Text>

              {variants.map((v, idx) => (
                <VariantCard
                  key={v.key}
                  variant={v}
                  index={idx}
                  canRemove={variants.length > 1}
                  onUpdate={updateVariant}
                  onRemove={removeVariantRow}
                />
              ))}

              <TouchableOpacity
                style={styles.addVariantBtn}
                onPress={addVariantRow}
                activeOpacity={0.8}
              >
                <Text style={styles.addVariantBtnText}>+ Add Variant</Text>
              </TouchableOpacity>
            </View>

            {/* Inline validation error */}
            {formError ? (
              <Text style={styles.formError}>{formError}</Text>
            ) : null}
          </ScrollView>
          )}

          {/* ── Sticky save button ── */}
          <View style={styles.bottomBar}>
            <TouchableOpacity
              style={[styles.saveBtn, (saving || formLoading) && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={saving || formLoading}
              activeOpacity={0.85}
            >
              {saving
                ? <ActivityIndicator color="#FFFFFF" />
                : <Text style={styles.saveBtnText}>{isEdit ? 'Update Product' : 'Save Product'}</Text>
              }
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    )
  }

  // ---- Render: Product list ----

  return (
    <SafeAreaView style={styles.safe}>
    <View style={styles.contentWrap}>
      {/* List header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBackBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.headerBackIcon}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Inventory</Text>
          <Text style={styles.headerSub}>{storeName}</Text>
        </View>
        <TouchableOpacity
          style={styles.addProductBtn}
          onPress={openAdd}
          activeOpacity={0.8}
        >
          <Text style={styles.addProductBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {/* Body */}
      {listLoading ? (
        <ListSkeleton />
      ) : listError ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{listError}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={keyExtractor}
          renderItem={renderProduct}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No products yet</Text>
              <Text style={styles.emptyBody}>
                Tap "+ Add" to list your first product in the marketplace.
              </Text>
            </View>
          }
        />
      )}
    </View>
    </SafeAreaView>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  flex: { flex: 1 },
  // Cap content at phone scale on wide displays
  contentWrap: {
    flex: 1,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Header (shared between list + add modes)
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#ECE6DC',
  },
  headerBackBtn:  { width: 40, height: 44, justifyContent: 'center' },
  headerBackIcon: { fontSize: 22, color: '#1C1612', lineHeight: 26 },
  headerCenter:   { flex: 1, alignItems: 'center' },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1C1612',
  },
  headerSub: {
    fontSize: 12,
    color: '#7A6A5A',
    marginTop: 1,
  },
  headerRight: { width: 40 },
  // "+ Add" button in list header
  addProductBtn: {
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#D9552B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addProductBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  // Product list
  listContent: {
    padding: 16,
    gap: 12,
    flexGrow: 1,
  },
  // Loading skeleton rows
  skeletonRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    overflow: 'hidden',
  },
  skeletonThumb: {
    width: 80,
    height: 80,
    borderRadius: 0,
  },
  skeletonBody: {
    flex: 1,
    padding: 12,
    gap: 8,
    justifyContent: 'center',
  },
  skeletonLineWide: {
    width: '70%',
    height: 12,
  },
  skeletonLineNarrow: {
    width: '40%',
    height: 10,
  },
  // Product card
  productCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#1C1612',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  productCardRow: {
    flexDirection: 'row',
  },
  productThumb: {
    width: 80,
    height: 80,
  },
  productThumbPlaceholder: {
    backgroundColor: '#ECE6DC',
  },
  productCardBody: {
    flex: 1,
    padding: 12,
    gap: 4,
  },
  productCardChevron: {
    justifyContent: 'center',
    paddingRight: 12,
  },
  productCardChevronText: {
    fontSize: 22,
    color: '#D9CFC4',
    fontWeight: '600',
  },
  productCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  productName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#1C1612',
    marginRight: 8,
  },
  productPrice: {
    fontSize: 13,
    fontWeight: '700',
    color: '#D9552B',
  },
  productMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F5EFE6',
  },
  variantCount: {
    fontSize: 12,
    color: '#7A6A5A',
  },
  stockIn:  { fontSize: 12, fontWeight: '600', color: '#166534' },
  stockOut: { fontSize: 12, fontWeight: '600', color: '#991B1B' },
  // Status badge
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
  },
  statusBadgeText:    { fontSize: 11, fontWeight: '700' },
  badgeActive:        { backgroundColor: '#DCFCE7' },
  badgeActiveText:    { color: '#166534' },
  badgeInactive:      { backgroundColor: '#F3F4F6' },
  badgeInactiveText:  { color: '#6B7280' },
  // Add-product form scroll
  formScrollContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 24,
  },
  // Section cards
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    gap: 10,
    shadowColor: '#1C1612',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1C1612',
    marginBottom: 2,
  },
  sectionHint: {
    fontSize: 12,
    color: '#7A6A5A',
    lineHeight: 17,
    marginTop: -4,
  },
  sectionHintPlain: {
    fontSize: 12,
    color: '#7A6A5A',
    lineHeight: 17,
  },
  // Inputs
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1C1612',
  },
  required:      { color: '#D9552B' },
  optionalLabel: { fontWeight: '400', color: '#7A6A5A' },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#D9CFC4',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#1C1612',
    minHeight: 48,
  },
  inputMultiline: {
    minHeight: 88,
    paddingTop: 12,
  },
  // Category chips
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#D9CFC4',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryChipActive: {
    backgroundColor: '#D9552B',
    borderColor: '#D9552B',
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#7A6A5A',
  },
  categoryChipActiveText: {
    color: '#FFFFFF',
  },
  // Condition segmented toggle
  conditionToggle: {
    flexDirection: 'row',
    backgroundColor: '#F5EFE6',
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  conditionSegment: {
    flex: 1,
    height: 40,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  conditionSegmentActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#1C1612',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  conditionSegmentText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#7A6A5A',
  },
  conditionSegmentActiveText: {
    color: '#1C1612',
    fontWeight: '700',
  },
  // Variant card
  variantCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECE6DC',
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  variantCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  variantCardTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#7A6A5A',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  variantRemoveBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F5EFE6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  variantRemoveText: {
    fontSize: 18,
    color: '#7A6A5A',
    lineHeight: 22,
    textAlign: 'center',
  },
  // 2-column variant field row
  variantRow: {
    flexDirection: 'row',
    gap: 8,
  },
  variantField: {
    flex: 1,
    gap: 4,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#7A6A5A',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  fieldInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#D9CFC4',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: '#1C1612',
    minHeight: 44,
  },
  // Photo grid
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  photoSlot: {
    width: 80,
    height: 80,
    borderRadius: 10,
    overflow: 'hidden',
  },
  photoThumb: {
    width: 80,
    height: 80,
  },
  photoRemoveBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(28,22,18,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoRemoveText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 20,
    textAlign: 'center',
  },
  photoAddSlot: {
    width: 80,
    height: 80,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#D9CFC4',
    borderStyle: 'dashed',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2,
  },
  photoAddIcon: {
    fontSize: 22,
    color: '#7A6A5A',
    lineHeight: 26,
  },
  photoAddLabel: {
    fontSize: 10,
    color: '#7A6A5A',
    fontWeight: '500',
  },
  // Add Variant button
  addVariantBtn: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#D9CFC4',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  addVariantBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#7A6A5A',
  },
  // Inline form error
  formError: {
    fontSize: 13,
    color: '#D9552B',
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  // Sticky save button
  bottomBar: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#ECE6DC',
  },
  saveBtn: {
    backgroundColor: '#D9552B',
    borderRadius: 28,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.38 },
  saveBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  // Empty / error states
  emptyState: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 80,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1612',
  },
  emptyBody: {
    fontSize: 14,
    color: '#7A6A5A',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 32,
  },
  errorText: {
    fontSize: 14,
    color: '#D9552B',
    textAlign: 'center',
    paddingHorizontal: 32,
    marginBottom: 16,
  },
  retryBtn: {
    height: 44,
    paddingHorizontal: 24,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#D9552B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  retryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#D9552B',
  },
})
