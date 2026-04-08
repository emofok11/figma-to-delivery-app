import React, { useState, useCallback, useRef, useEffect } from 'react';
import { ImageSlotConfig, ImageData, CropData } from '../types/template';
import './ImageUploader.css';

interface ImageUploaderProps {
  slot: ImageSlotConfig;
  value?: ImageData | null;
  onChange: (data: ImageData | null) => void;
  isSelected?: boolean;
  onSelect?: () => void;
  /** 自定义标题（用户编辑后的值） */
  customLabel?: string;
  /** 标题变更回调，传入时标题变为可编辑 */
  onLabelChange?: (newLabel: string) => void;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({
  slot,
  value,
  onChange,
  isSelected = false,
  onSelect,
  customLabel,
  onLabelChange
}) => {
  const [isEditing, setIsEditing] = useState(false);
  // 标题编辑模式：点击占位提示后进入编辑
  const [isLabelEditing, setIsLabelEditing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [scale, setScale] = useState(value?.scale || 1);
  const [crop, setCrop] = useState<CropData | null>(value?.cropData || null);
  const [preview, setPreview] = useState<string>(value?.preview || '');
  const [actualWidth, setActualWidth] = useState<number>(value?.actualWidth || 0);
  const [actualHeight, setActualHeight] = useState<number>(value?.actualHeight || 0);
  // 马赛克区域列表（当前编辑会话中的区域）
  const [mosaicRegions, setMosaicRegions] = useState<MosaicRegion[]>([]);
  // 已保存的马赛克区域（确认编辑后持久保存，用于二次编辑时恢复显示）
  const [savedMosaicRegions, setSavedMosaicRegions] = useState<MosaicRegion[]>([]);
  // 保存马赛克区域时对应的图片显示尺寸（用于坐标映射）
  const savedMosaicImgSize = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  // 马赛克烧录前的干净图片（用于清除所有马赛克时恢复）
  const cleanPreviewBeforeMosaic = useRef<string>('');
  // 当前编辑模式：'crop' 裁切 | 'mosaic' 马赛克
  const [editorMode, setEditorMode] = useState<'crop' | 'mosaic'>('crop');
  // 原始完整图片（始终保留，裁切基于此图操作）
  const [originalPreview, setOriginalPreview] = useState<string>('');
  // 编辑器中当前显示的图片（可能是原图或裁切后的图）
  const [editorPreview, setEditorPreview] = useState<string>('');
  // 是否已执行过裁切（用于显示提示）
  const [hasCropped, setHasCropped] = useState(false);
  // 上次裁切框的位置（相对于原图的比例值，用于再次裁切时恢复显示）
  const lastCropRatio = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cropContainerRef = useRef<HTMLDivElement>(null);
  // 追踪上次从外部 value 同步过来的 preview，用于区分「外部替换新图」和「内部编辑后 value 回传」
  const lastKnownValuePreview = useRef<string>(value?.preview || '');

  // 同步外部value变化到内部状态
  useEffect(() => {
    const newPreview = value?.preview || '';
    setPreview(newPreview);
    setActualWidth(value?.actualWidth || 0);
    setActualHeight(value?.actualHeight || 0);
    setScale(value?.scale || 1);
    setCrop(value?.cropData || null);

    // 判断是否为外部替换的全新图片：
    // 1. newPreview 不为空
    // 2. newPreview 与上次已知的外部值不同（说明不是内部编辑回传，而是外部替换了新图）
    if (newPreview && newPreview !== lastKnownValuePreview.current) {
      // 检查是否是内部编辑导致的变化（内部编辑后 preview 会先被 setPreview 更新）
      // 如果 newPreview 与当前 editorPreview 不同，说明是外部替换的新图
      // 注意：这里不能直接用 editorPreview 判断，因为 state 可能还没更新
      // 所以用 lastKnownValuePreview 来判断
      setOriginalPreview(newPreview);
      setEditorPreview(newPreview);
    }
    // 更新追踪值
    lastKnownValuePreview.current = newPreview;
  }, [value]);

  // 编辑器打开时重置状态
  useEffect(() => {
    if (isEditing && preview) {
      // 首次打开时备份原始图片（如果还没有原图备份）
      if (!originalPreview) {
        setOriginalPreview(preview);
      }
      // 二次编辑时优先使用干净原图（不含马赛克），让用户从原图重新开始裁切
      // 首次编辑时 originalPreview 还未设置，使用 preview
      setEditorPreview(originalPreview || preview);
      setEditorMode('crop');
      // 清空所有马赛克状态（二次编辑从干净原图开始，马赛克需重新添加）
      setMosaicRegions([]);
      setSavedMosaicRegions([]);
      setHasCropped(false);
    }
  }, [isEditing]); // eslint-disable-line react-hooks/exhaustive-deps

  // 处理文件选择
  const handleFileSelect = useCallback((file: File) => {
    // 验证格式
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (slot.supportedFormats && ext && !slot.supportedFormats.includes(ext)) {
      alert(`不支持的文件格式，请上传 ${slot.supportedFormats.join(', ')} 格式`);
      return;
    }

    // 验证尺寸
    const img = new Image();
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const result = e.target?.result as string;
      img.src = result;
      img.onload = () => {
        if (slot.minWidth && img.width < slot.minWidth) {
          alert(`图片宽度不能小于 ${slot.minWidth}px`);
          return;
        }
        if (slot.minHeight && img.height < slot.minHeight) {
          alert(`图片高度不能小于 ${slot.minHeight}px`);
          return;
        }
        
        setPreview(result);
        setOriginalPreview(result); // 上传新图时同步更新原图备份
        setEditorPreview(result); // 同步编辑器预览
        lastKnownValuePreview.current = ''; // 重置追踪值，让 value 同步时不会误判
        lastCropRatio.current = null; // 新图片清空上次裁切位置记录
        setActualWidth(img.width);
        setActualHeight(img.height);
        setIsEditing(true);
      };
    };
    
    reader.readAsDataURL(file);
  }, [slot]);

  // 拖拽处理
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  // 点击上传
  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  // 裁切操作
  const handleCropChange = useCallback((newCrop: CropData) => {
    setCrop(newCrop);
  }, []);

  // 缩放操作
  const handleScaleChange = useCallback((newScale: number) => {
    setScale(newScale);
  }, []);

  // 添加马赛克区域回调
  const handleAddMosaic = useCallback((region: MosaicRegion) => {
    setMosaicRegions(prev => [...prev, region]);
  }, []);

  // 删除马赛克区域
  const handleRemoveMosaic = useCallback((index: number) => {
    setMosaicRegions(prev => prev.filter((_, i) => i !== index));
  }, []);

  // 确认裁切：基于当前编辑器中显示的图片执行裁切
  const handleConfirmCrop = useCallback(async () => {
    if (!crop || crop.width < 10 || crop.height < 10) {
      alert('请先选择有效的裁切区域');
      return;
    }

    // 获取编辑器中图片元素的显示位置和尺寸
    const imgEl = document.querySelector('.crop-editor img') as HTMLImageElement;
    const containerEl = document.querySelector('.crop-editor') as HTMLElement;
    if (!imgEl || !containerEl) return;

    // 确保图片已加载完成（src 切换后可能还在加载中）
    if (!imgEl.complete || imgEl.naturalWidth === 0) {
      await new Promise<void>((resolve) => {
        imgEl.onload = () => resolve();
      });
    }

    const containerRect = containerEl.getBoundingClientRect();
    const imgRect = imgEl.getBoundingClientRect();

    // 图片在容器中的偏移（图片可能居中，不在左上角）
    const imgOffsetX = imgRect.left - containerRect.left;
    const imgOffsetY = imgRect.top - containerRect.top;
    // 图片的实际显示尺寸
    const imgDisplayWidth = imgRect.width;
    const imgDisplayHeight = imgRect.height;

    // 将裁切框坐标从容器坐标系转换为图片坐标系
    const cropRelativeToImg: CropData = {
      x: crop.x - imgOffsetX,
      y: crop.y - imgOffsetY,
      width: crop.width,
      height: crop.height
    };

    // 基于当前编辑器中显示的图片执行裁切（可能是原图或已裁切过的图）
    const result = await cropImage(editorPreview, cropRelativeToImg, imgDisplayWidth, imgDisplayHeight);
    
    // 更新编辑器预览为裁切后的图片（originalPreview 保持不变）
    setEditorPreview(result.preview);
    setActualWidth(result.width);
    setActualHeight(result.height);
    // 保存本次裁切框相对于图片的比例值（用于再次裁切时恢复位置）
    lastCropRatio.current = {
      x: cropRelativeToImg.x / imgDisplayWidth,
      y: cropRelativeToImg.y / imgDisplayHeight,
      width: cropRelativeToImg.width / imgDisplayWidth,
      height: cropRelativeToImg.height / imgDisplayHeight
    };
    setCrop(null); // 清空裁切框
    setHasCropped(true); // 标记已裁切
    // 裁切后清空当前未确认的马赛克区域（坐标已失效），但保留已确认烧录的马赛克（已嵌入图片中）
    setMosaicRegions([]);
  }, [editorPreview, crop]);

  // 确认马赛克：将马赛克区域烧录到图片中，保存区域信息
  const handleConfirmMosaic = useCallback(async () => {
    if (!editorPreview || mosaicRegions.length === 0) return;
    const imgEl = document.querySelector('.crop-editor img') as HTMLImageElement;
    const containerEl = document.querySelector('.crop-editor') as HTMLElement;
    if (!imgEl || !containerEl) return;

    const containerRect = containerEl.getBoundingClientRect();
    const imgRect = imgEl.getBoundingClientRect();
    // 图片在容器中的偏移（图片可能居中）
    const imgOffsetX = imgRect.left - containerRect.left;
    const imgOffsetY = imgRect.top - containerRect.top;
    // 将马赛克区域坐标从容器坐标系转换为图片坐标系
    const adjustedRegions = mosaicRegions.map(r => ({
      x: r.x - imgOffsetX,
      y: r.y - imgOffsetY,
      width: r.width,
      height: r.height
    }));
    // 烧录前保存干净图片（如果还没保存过，即首次烧录）
    if (!cleanPreviewBeforeMosaic.current) {
      cleanPreviewBeforeMosaic.current = editorPreview;
    }
    // 烧录马赛克到图片
    const newPreview = await applyMosaicToImage(editorPreview, adjustedRegions, imgRect.width, imgRect.height);
    // 保存马赛克区域比例值（用于二次编辑恢复）
    setSavedMosaicRegions(adjustedRegions.map(r => ({
      x: r.x / imgRect.width,
      y: r.y / imgRect.height,
      width: r.width / imgRect.width,
      height: r.height / imgRect.height
    })));
    savedMosaicImgSize.current = { width: imgRect.width, height: imgRect.height };
    // 更新编辑器预览为烧录后的图片
    setEditorPreview(newPreview);
    // 注意：不更新 originalPreview，保持最初原图不变，二次裁切时恢复原图
    // 清空当前编辑会话的马赛克区域
    setMosaicRegions([]);
  }, [editorPreview, mosaicRegions]);

  // 清除所有马赛克区域（包括未确认的和已烧录的）
  const handleClearAllMosaic = useCallback(() => {
    // 清空当前编辑中的马赛克区域
    setMosaicRegions([]);
    // 清空已保存的马赛克区域
    setSavedMosaicRegions([]);
    savedMosaicImgSize.current = { width: 0, height: 0 };
    // 如果有烧录前的干净图片，恢复它（撤销马赛克烧录效果）
    if (cleanPreviewBeforeMosaic.current) {
      setEditorPreview(cleanPreviewBeforeMosaic.current);
      cleanPreviewBeforeMosaic.current = '';
    }
  }, []);

  // 切换到马赛克模式：恢复已保存的马赛克区域
  const handleSwitchToMosaic = useCallback(() => {
    // 如果当前没有马赛克区域但有已保存的，恢复显示
    if (mosaicRegions.length === 0 && savedMosaicRegions.length > 0) {
      // 等 DOM 更新后获取当前图片显示尺寸，将比例值转换回像素坐标
      requestAnimationFrame(() => {
        const imgEl = document.querySelector('.crop-editor img') as HTMLImageElement;
        const containerEl = document.querySelector('.crop-editor') as HTMLElement;
        if (imgEl && containerEl) {
          const containerRect = containerEl.getBoundingClientRect();
          const imgRect = imgEl.getBoundingClientRect();
          // 图片在容器中的偏移
          const imgOffsetX = imgRect.left - containerRect.left;
          const imgOffsetY = imgRect.top - containerRect.top;
          // 将比例值转换为当前显示尺寸下的像素坐标（相对于容器）
          const restored = savedMosaicRegions.map(r => ({
            x: r.x * imgRect.width + imgOffsetX,
            y: r.y * imgRect.height + imgOffsetY,
            width: r.width * imgRect.width,
            height: r.height * imgRect.height
          }));
          setMosaicRegions(restored);
        }
      });
    }
    setEditorMode('mosaic');
  }, [mosaicRegions.length, savedMosaicRegions]);

  // 切换到裁切模式：恢复原图供重新选择裁切区域，并尝试恢复上次裁切框位置
  const handleSwitchToCrop = useCallback(() => {
    if (originalPreview) {
      // 恢复原图显示，让用户重新选择裁切区域
      setEditorPreview(originalPreview);
      // 重新计算原图尺寸，并在图片加载完成后恢复上次裁切框位置
      const img = new Image();
      img.onload = () => {
        setActualWidth(img.naturalWidth);
        setActualHeight(img.naturalHeight);
        // 图片加载完成后，根据保存的比例值恢复上次裁切框位置
        if (lastCropRatio.current) {
          // 需要等 DOM 更新后获取图片实际显示尺寸
          requestAnimationFrame(() => {
            const imgEl = document.querySelector('.crop-editor img') as HTMLImageElement;
            const containerEl = document.querySelector('.crop-editor') as HTMLElement;
            if (imgEl && containerEl) {
              const containerRect = containerEl.getBoundingClientRect();
              const imgRect = imgEl.getBoundingClientRect();
              // 图片在容器中的偏移
              const imgOffsetX = imgRect.left - containerRect.left;
              const imgOffsetY = imgRect.top - containerRect.top;
              // 将比例值转换为容器坐标系下的像素值
              const restoredCrop: CropData = {
                x: lastCropRatio.current!.x * imgRect.width + imgOffsetX,
                y: lastCropRatio.current!.y * imgRect.height + imgOffsetY,
                width: lastCropRatio.current!.width * imgRect.width,
                height: lastCropRatio.current!.height * imgRect.height
              };
              setCrop(restoredCrop);
            }
          });
        }
      };
      img.src = originalPreview;
    }
    // 先清空裁切框，等图片加载后再恢复（如果有保存的位置）
    setCrop(null);
    setHasCropped(false); // 重置裁切标记
    // 二次裁切时清空所有马赛克（恢复原图重新裁切，马赛克需要重新添加）
    setMosaicRegions([]);
    setSavedMosaicRegions([]);
    setEditorMode('crop');
  }, [originalPreview]);

  // 确认编辑（如果还有未确认的马赛克区域，自动烧录到图片中）
  const handleConfirm = useCallback(async () => {
    if (!editorPreview) return;

    let finalPreview = editorPreview;

    // 如果还有未确认的马赛克区域（用户跳过了"确认马赛克"直接点确认），自动烧录
    if (mosaicRegions.length > 0) {
      const imgEl = document.querySelector('.crop-editor img') as HTMLImageElement;
      const containerEl = document.querySelector('.crop-editor') as HTMLElement;
      if (imgEl && containerEl) {
        const containerRect = containerEl.getBoundingClientRect();
        const imgRect = imgEl.getBoundingClientRect();
        const imgOffsetX = imgRect.left - containerRect.left;
        const imgOffsetY = imgRect.top - containerRect.top;
        // 将马赛克区域坐标从容器坐标系转换为图片坐标系
        const adjustedRegions = mosaicRegions.map(r => ({
          x: r.x - imgOffsetX,
          y: r.y - imgOffsetY,
          width: r.width,
          height: r.height
        }));
        finalPreview = await applyMosaicToImage(editorPreview, adjustedRegions, imgRect.width, imgRect.height);
      }
    }

    const imageData: ImageData = {
      id: `img-${Date.now()}`,
      slotId: slot.id,
      file: fileInputRef.current?.files?.[0] || null,
      preview: finalPreview,
      cropData: crop || undefined,
      scale,
      actualWidth,
      actualHeight
    };

    // 先更新内部 preview 和 lastKnownValuePreview，
    // 这样后续 value 同步 useEffect 触发时能正确识别这是内部编辑回传，而非外部替换
    setPreview(finalPreview);
    lastKnownValuePreview.current = finalPreview;
    onChange(imageData);
    setIsEditing(false);
    setMosaicRegions([]); // 确认后清空当前编辑会话的马赛克区域
    setEditorMode('crop'); // 重置模式
    // 注意：不清空 savedMosaicRegions，保留马赛克区域备份，下次编辑时可恢复
    // 注意：不清空 originalPreview，保留原图备份，下次编辑时可恢复原图重新裁切
  }, [editorPreview, crop, scale, slot.id, onChange, actualWidth, actualHeight, mosaicRegions]);

  // 取消编辑
  const handleCancel = useCallback(() => {
    setIsEditing(false);
    setPreview(value?.preview || '');
    setCrop(value?.cropData || null);
    setScale(value?.scale || 1);
    setActualWidth(value?.actualWidth || 0);
    setActualHeight(value?.actualHeight || 0);
  }, [value]);

  // 删除图片
  const handleDelete = useCallback(() => {
    setPreview('');
    setOriginalPreview(''); // 删除图片时同步清空原图备份
    setEditorPreview('');
    setSavedMosaicRegions([]); // 删除图片时清空已保存的马赛克区域
    savedMosaicImgSize.current = { width: 0, height: 0 };
    cleanPreviewBeforeMosaic.current = ''; // 删除图片时清空烧录前备份
    lastKnownValuePreview.current = ''; // 重置追踪值
    lastCropRatio.current = null; // 清空裁切位置记录
    setCrop(null);
    setScale(1);
    setActualWidth(0);
    setActualHeight(0);
    onChange(null);
  }, [onChange]);

  // 渲染上传区域
  const renderUploadArea = () => (
    <div
      className={`image-uploader-dropzone ${isDragging ? 'dragging' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleInputChange}
        style={{ display: 'none' }}
      />
      <div className="dropzone-content">
        <div className="upload-icon">📁</div>
        <p className="upload-text">点击或拖拽上传图片</p>
        <p className="upload-hint paste-hint">✨ 或悬停选中后按 Ctrl+V 粘贴</p>
        {slot.supportedFormats && (
          <p className="upload-hint">支持格式: {slot.supportedFormats.join(', ')}</p>
        )}
      </div>
    </div>
  );

  // 渲染编辑器
  const renderEditor = () => (
    <div className="image-editor-overlay">
      <div className="image-editor-modal">
        <div className="editor-header">
          <div className="editor-header-top">
            <h3>图片编辑 - {slot.label}</h3>
            {/* 模式提示 */}
            <span className="editor-mode-hint">
              {editorMode === 'crop' ? '拖拽裁切区域，或拖动角点调整大小' : '在图片上拖拽选择需要马赛克的区域'}
            </span>
          </div>
          {/* 工具栏：裁切/马赛克模式切换（两者独立，互不依赖） */}
          <div className="editor-toolbar">
            {/* 裁切/确认裁切 互斥按钮：有有效裁切框时显示"确认裁切"，否则显示"裁切" */}
            {editorMode === 'crop' && crop && crop.width >= 10 && crop.height >= 10 ? (
              <button
                className="toolbar-btn toolbar-btn-crop btn-confirm-crop active"
                onClick={handleConfirmCrop}
                title="确认当前裁切区域"
              >
                ✔️ 确认裁切
              </button>
            ) : (
              <button
                className={`toolbar-btn toolbar-btn-crop ${editorMode === 'crop' ? 'active' : ''}`}
                onClick={handleSwitchToCrop}
                title="裁切工具（点击图片区域拖拽选择裁切区域）"
              >
                ✂️ 裁切 {hasCropped && '✓'}
              </button>
            )}
            {/* 马赛克/确认马赛克 互斥按钮：有马赛克区域时显示"确认马赛克"，否则显示"马赛克" */}
            {editorMode === 'mosaic' && mosaicRegions.length > 0 ? (
              <div className="toolbar-btn-wrapper">
                <button
                  className="toolbar-btn toolbar-btn-mosaic btn-confirm-mosaic active"
                  onClick={handleConfirmMosaic}
                  title="确认当前马赛克区域"
                >
                  ✔️ 确认马赛克 ({mosaicRegions.length})
                </button>
                {/* 清除按钮：放在确认按钮旁 */}
                <button
                  className="btn-clear-inline"
                  onClick={handleClearAllMosaic}
                  title="清除所有马赛克区域"
                >
                  ✕
                </button>
              </div>
            ) : (
              <div className="toolbar-btn-wrapper">
                <button
                  className={`toolbar-btn toolbar-btn-mosaic ${editorMode === 'mosaic' ? 'active' : ''}`}
                  onClick={() => handleSwitchToMosaic()}
                  title="马赛克工具（在图片上拖拽选择马赛克区域）"
                >
                  � 马赛克 {savedMosaicRegions.length > 0 && '✓'}
                </button>
                {/* 已保存马赛克数量角标 */}
                {savedMosaicRegions.length > 0 && (
                  <span className="mosaic-badge">{savedMosaicRegions.length}</span>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="editor-body">
          <div className="editor-preview" ref={cropContainerRef}>
            <CropEditor
              imageSrc={editorPreview}
              aspectRatio={slot.aspectRatio}
              crop={crop}
              scale={scale}
              onCropChange={handleCropChange}
              onScaleChange={handleScaleChange}
              mode={editorMode}
              mosaicRegions={mosaicRegions}
              onAddMosaic={handleAddMosaic}
              onRemoveMosaic={handleRemoveMosaic}
            />
          </div>

        </div>
        <div className="editor-footer">
          <button className="btn-secondary" onClick={handleCancel}>取消</button>
          <button className="btn-primary" onClick={handleConfirm}>确认</button>
        </div>
      </div>
    </div>
  );

  // 渲染预览
  const renderPreview = () => (
    <div className="image-uploader-preview">
      <div className="preview-image-container">
        {/* 用 width 百分比控制缩放，而非 transform，避免图片撑不开容器 */}
        <img src={preview} alt={slot.label} style={{ width: `${scale * 100}%`, height: 'auto' }} />
        {crop && (
          <div 
            className="crop-overlay"
            style={{
              left: crop.x,
              top: crop.y,
              width: crop.width,
              height: crop.height
            }}
          />
        )}
      </div>
      <div className="preview-info">
        {actualWidth > 0 && actualHeight > 0 && (
          <span className="actual-size">实际尺寸: {actualWidth}x{actualHeight}px</span>
        )}
      </div>
      <div className="preview-actions">
        <button className="btn-edit" onClick={() => setIsEditing(true)}>编辑</button>
        <button className="btn-delete" onClick={handleDelete}>删除</button>
      </div>
    </div>
  );

  // 点击/移入选中
  const handleSelect = useCallback(() => {
    onSelect?.();
    console.log('选中图片坑位:', slot.id, slot.label);
  }, [onSelect, slot.id, slot.label]);

  return (
    <div 
      className={`image-uploader ${isSelected ? 'selected' : ''}`}
      onMouseEnter={handleSelect}
      onClick={(e) => {
        // 如果点击的是上传区域，不阻止默认行为
        const target = e.target as HTMLElement;
        if (!target.closest('.preview-actions')) {
          handleSelect();
        }
      }}
    >
      <div className="image-uploader-header">
        {/* 可编辑标题：传入 onLabelChange 时，有内容显示 input，无内容显示占位提示 */}
        {onLabelChange ? (
          customLabel || isLabelEditing ? (
            // 已填写自定义标题 或 正在编辑：显示可编辑 input
            <input
              className="slot-label slot-label-editable"
              type="text"
              value={customLabel || ''}
              onChange={(e) => onLabelChange(e.target.value)}
              onBlur={() => setIsLabelEditing(false)}
              placeholder="输入自定义标题"
              autoFocus={isLabelEditing && !customLabel}
            />
          ) : (
            // 未填写且未编辑：显示可点击的占位提示
            <span
              className="slot-label slot-label-placeholder"
              onClick={() => setIsLabelEditing(true)}
            >
              点击添加标题
            </span>
          )
        ) : (
          // 非自定义容器：直接显示固定标题
          <span className="slot-label">{slot.label}</span>
        )}
        {slot.required && <span className="required-mark">*</span>}
      </div>
      <div className="image-uploader-body">
        {preview ? renderPreview() : renderUploadArea()}
      </div>
      <div className="image-uploader-footer">
        <span className="slot-description">{slot.description}</span>
      </div>
      {isEditing && renderEditor()}
    </div>
  );
};

// 马赛克区域类型
interface MosaicRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

// 马赛克块大小常量
const MOSAIC_BLOCK_SIZE = 10;

/**
 * 裁切图片的工具函数
 * 根据裁切区域从原图中截取指定区域
 */
function cropImage(
  imageSrc: string,
  cropData: CropData,
  imgDisplayWidth: number,
  imgDisplayHeight: number
): Promise<{ preview: string; width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      // 计算显示坐标到实际图片坐标的缩放比
      const scaleX = img.naturalWidth / imgDisplayWidth;
      const scaleY = img.naturalHeight / imgDisplayHeight;

      // 裁切区域在原图上的实际坐标和尺寸
      const srcX = Math.round(cropData.x * scaleX);
      const srcY = Math.round(cropData.y * scaleY);
      const srcW = Math.round(cropData.width * scaleX);
      const srcH = Math.round(cropData.height * scaleY);

      // 创建 Canvas 裁切
      const canvas = document.createElement('canvas');
      canvas.width = srcW;
      canvas.height = srcH;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);

      resolve({
        preview: canvas.toDataURL('image/png'),
        width: srcW,
        height: srcH
      });
    };
    img.src = imageSrc;
  });
}

/**
 * 将马赛克烧录到图片中的工具函数
 * 在最终确认时调用，将马赛克永久写入图片
 */
async function applyMosaicToImage(
  imageSrc: string,
  regions: MosaicRegion[],
  imgDisplayWidth: number,
  imgDisplayHeight: number
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);

      // 计算显示坐标到实际图片坐标的缩放比
      const scaleX = img.width / imgDisplayWidth;
      const scaleY = img.height / imgDisplayHeight;

      // 对每个马赛克区域进行像素化处理
      regions.forEach(region => {
        const rx = Math.round(region.x * scaleX);
        const ry = Math.round(region.y * scaleY);
        const rw = Math.round(region.width * scaleX);
        const rh = Math.round(region.height * scaleY);

        if (rw <= 0 || rh <= 0) return;

        // 像素化：缩小后放大实现马赛克效果
        const smallW = Math.max(1, Math.ceil(rw / MOSAIC_BLOCK_SIZE));
        const smallH = Math.max(1, Math.ceil(rh / MOSAIC_BLOCK_SIZE));
        const smallCanvas = document.createElement('canvas');
        smallCanvas.width = smallW;
        smallCanvas.height = smallH;
        const smallCtx = smallCanvas.getContext('2d')!;
        // 缩小（取样）
        smallCtx.drawImage(canvas, rx, ry, rw, rh, 0, 0, smallW, smallH);
        // 放大回原尺寸（像素化效果）
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(smallCanvas, 0, 0, smallW, smallH, rx, ry, rw, rh);
        ctx.imageSmoothingEnabled = true;
      });

      resolve(canvas.toDataURL('image/png'));
    };
    img.src = imageSrc;
  });
}

/**
 * 在 Canvas 上实时渲染马赛克预览效果
 * 将原图指定区域像素化后绘制到 overlay canvas 上
 */
function renderMosaicPreview(
  canvas: HTMLCanvasElement,
  sourceImg: HTMLImageElement,
  regions: MosaicRegion[],
  imgRect: { x: number; y: number; width: number; height: number }
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // 清空画布
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (regions.length === 0) return;

  // 计算显示坐标到原图坐标的缩放比
  const scaleX = sourceImg.naturalWidth / imgRect.width;
  const scaleY = sourceImg.naturalHeight / imgRect.height;

  regions.forEach(region => {
    // 区域在 canvas 上的位置（相对于图片左上角）
    const dispX = region.x - imgRect.x;
    const dispY = region.y - imgRect.y;
    const dispW = region.width;
    const dispH = region.height;

    if (dispW <= 0 || dispH <= 0) return;

    // 对应原图上的区域
    const srcX = Math.round(dispX * scaleX);
    const srcY = Math.round(dispY * scaleY);
    const srcW = Math.round(dispW * scaleX);
    const srcH = Math.round(dispH * scaleY);

    if (srcW <= 0 || srcH <= 0) return;

    // 像素化：先缩小再放大
    const smallW = Math.max(1, Math.ceil(srcW / MOSAIC_BLOCK_SIZE));
    const smallH = Math.max(1, Math.ceil(srcH / MOSAIC_BLOCK_SIZE));
    const smallCanvas = document.createElement('canvas');
    smallCanvas.width = smallW;
    smallCanvas.height = smallH;
    const smallCtx = smallCanvas.getContext('2d')!;
    // 从原图取样缩小
    smallCtx.drawImage(sourceImg, srcX, srcY, srcW, srcH, 0, 0, smallW, smallH);
    // 放大绘制到 overlay canvas（像素化效果）
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(smallCanvas, 0, 0, smallW, smallH, region.x, region.y, dispW, dispH);
    ctx.imageSmoothingEnabled = true;

    // 绘制边框
    ctx.strokeStyle = '#ff6b35';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(region.x, region.y, dispW, dispH);
    ctx.setLineDash([]);
  });
}

// 拖拽操作类型
type DragAction = 
  | 'none'
  | 'move'           // 移动裁切框
  | 'resize-nw'      // 左上角调整大小
  | 'resize-ne'      // 右上角调整大小
  | 'resize-sw'      // 左下角调整大小
  | 'resize-se'      // 右下角调整大小
  | 'resize-n'       // 上边中点调整高度
  | 'resize-s'       // 下边中点调整高度
  | 'resize-w'       // 左边中点调整宽度
  | 'resize-e'       // 右边中点调整宽度
  | 'draw-crop'      // 绘制新裁切框
  | 'draw-mosaic';   // 绘制马赛克区域

// 裁切编辑器组件
interface CropEditorProps {
  imageSrc: string;
  aspectRatio?: number;
  crop: CropData | null;
  scale: number;
  onCropChange: (crop: CropData) => void;
  onScaleChange: (scale: number) => void;
  /** 当前编辑模式 */
  mode: 'crop' | 'mosaic';
  /** 马赛克区域列表 */
  mosaicRegions: MosaicRegion[];
  /** 添加马赛克区域 */
  onAddMosaic: (region: MosaicRegion) => void;
  /** 删除马赛克区域 */
  onRemoveMosaic: (index: number) => void;
}

const CropEditor: React.FC<CropEditorProps> = ({
  imageSrc,
  aspectRatio,
  crop,
  scale,
  onCropChange,
  onScaleChange,
  mode,
  mosaicRegions,
  onAddMosaic,
  onRemoveMosaic
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const mosaicCanvasRef = useRef<HTMLCanvasElement>(null);
  const [dragAction, setDragAction] = useState<DragAction>('none');
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [startCrop, setStartCrop] = useState<CropData>({ x: 0, y: 0, width: 0, height: 0 });
  const [currentCrop, setCurrentCrop] = useState<CropData>(crop || { x: 0, y: 0, width: 100, height: 100 });
  // 马赛克绘制中的临时区域
  const [drawingMosaic, setDrawingMosaic] = useState<MosaicRegion | null>(null);

  useEffect(() => {
    if (crop) {
      setCurrentCrop(crop);
    } else {
      // crop 为 null 时重置裁切框（裁切确认后清空显示）
      setCurrentCrop({ x: 0, y: 0, width: 0, height: 0 });
    }
  }, [crop]);

  // 获取图片在容器中的实际显示位置和尺寸
  const getImgRect = useCallback(() => {
    if (!imgRef.current || !containerRef.current) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }
    const containerRect = containerRef.current.getBoundingClientRect();
    const imgRect = imgRef.current.getBoundingClientRect();
    return {
      x: imgRect.left - containerRect.left,
      y: imgRect.top - containerRect.top,
      width: imgRect.width,
      height: imgRect.height
    };
  }, []);

  // 实时渲染马赛克预览效果
  useEffect(() => {
    const canvas = mosaicCanvasRef.current;
    const img = imgRef.current;
    const container = containerRef.current;
    if (!canvas || !img || !container) return;

    // 同步 canvas 尺寸与容器一致
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    // 合并已确认的区域和正在绘制的临时区域
    const allRegions = drawingMosaic
      ? [...mosaicRegions, drawingMosaic]
      : mosaicRegions;

    const imgRect = getImgRect();
    renderMosaicPreview(canvas, img, allRegions, imgRect);
  }, [mosaicRegions, drawingMosaic, scale, getImgRect]);

  // 获取容器内的相对坐标
  const getRelativePos = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }, []);

  // 获取容器尺寸
  const getContainerSize = useCallback(() => {
    if (!containerRef.current) return { width: 0, height: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }, []);

  // 判断鼠标是否在某个 handle 上（包括四角和四边中点）
  const getHandleAtPos = useCallback((x: number, y: number, cropBox: CropData): string | null => {
    // 裁切框太小时不检测 handle
    if (cropBox.width < 10 || cropBox.height < 10) return null;
    const handleSize = 14; // handle 的点击热区
    const half = handleSize / 2;
    // 四角 handle（优先检测，因为角点同时属于两条边）
    const corners = [
      { name: 'nw', cx: cropBox.x, cy: cropBox.y },
      { name: 'ne', cx: cropBox.x + cropBox.width, cy: cropBox.y },
      { name: 'sw', cx: cropBox.x, cy: cropBox.y + cropBox.height },
      { name: 'se', cx: cropBox.x + cropBox.width, cy: cropBox.y + cropBox.height },
    ];
    for (const c of corners) {
      if (x >= c.cx - half && x <= c.cx + half && y >= c.cy - half && y <= c.cy + half) {
        return c.name;
      }
    }
    // 四边中点 handle
    const edges = [
      { name: 'n', cx: cropBox.x + cropBox.width / 2, cy: cropBox.y },
      { name: 's', cx: cropBox.x + cropBox.width / 2, cy: cropBox.y + cropBox.height },
      { name: 'w', cx: cropBox.x, cy: cropBox.y + cropBox.height / 2 },
      { name: 'e', cx: cropBox.x + cropBox.width, cy: cropBox.y + cropBox.height / 2 },
    ];
    for (const e of edges) {
      if (x >= e.cx - half && x <= e.cx + half && y >= e.cy - half && y <= e.cy + half) {
        return e.name;
      }
    }
    return null;
  }, []);

  // 判断鼠标是否在裁切框内部
  const isInsideCrop = useCallback((x: number, y: number, cropBox: CropData): boolean => {
    return x >= cropBox.x && x <= cropBox.x + cropBox.width &&
           y >= cropBox.y && y <= cropBox.y + cropBox.height;
  }, []);

  // 获取相对于容器的坐标（从原生 MouseEvent 计算）
  const getRelativePosFromNative = useCallback((e: MouseEvent) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }, []);

  // 使用 ref 保存拖动状态，避免 document 事件监听器中的闭包陈旧问题
  const dragActionRef = useRef<DragAction>('none');
  const startPosRef = useRef({ x: 0, y: 0 });
  const startCropRef = useRef<CropData>({ x: 0, y: 0, width: 0, height: 0 });
  const currentCropRef = useRef<CropData>(currentCrop);
  const drawingMosaicRef = useRef<MosaicRegion | null>(null);

  // 同步 currentCrop state 到 ref（确保 document 事件监听器中能读到最新值）
  useEffect(() => {
    currentCropRef.current = currentCrop;
  }, [currentCrop]);

  // 当外部 crop prop 变化时，同步更新 ref（解决 requestAnimationFrame 恢复裁切框后 ref 未更新的问题）
  useEffect(() => {
    if (crop) {
      currentCropRef.current = crop;
    }
  }, [crop]);

  // document 级别的 mousemove 处理
  const handleDocMouseMove = useCallback((e: MouseEvent) => {
    const action = dragActionRef.current;
    if (action === 'none') return;
    e.preventDefault(); // 防止拖动时选中文字
    const pos = getRelativePosFromNative(e);
    const container = getContainerSize();

    if (action === 'draw-mosaic') {
      // 绘制马赛克区域
      const sx = startPosRef.current.x;
      const sy = startPosRef.current.y;
      const x = Math.min(sx, pos.x);
      const y = Math.min(sy, pos.y);
      const w = Math.abs(pos.x - sx);
      const h = Math.abs(pos.y - sy);
      const region = { x, y, width: w, height: h };
      drawingMosaicRef.current = region;
      setDrawingMosaic(region);
      return;
    }

    if (action === 'draw-crop') {
      // 绘制新裁切框
      const sx = startPosRef.current.x;
      const sy = startPosRef.current.y;
      const x = Math.max(0, Math.min(sx, pos.x));
      const y = Math.max(0, Math.min(sy, pos.y));
      const w = Math.min(Math.abs(pos.x - sx), container.width - x);
      const h = Math.min(Math.abs(pos.y - sy), container.height - y);
      const newCrop = { x, y, width: w, height: h };
      currentCropRef.current = newCrop;
      setCurrentCrop(newCrop);
      return;
    }

    if (action === 'move') {
      // 移动裁切框
      const sc = startCropRef.current;
      const dx = pos.x - startPosRef.current.x;
      const dy = pos.y - startPosRef.current.y;
      const newX = Math.max(0, Math.min(sc.x + dx, container.width - sc.width));
      const newY = Math.max(0, Math.min(sc.y + dy, container.height - sc.height));
      const newCrop = { ...sc, x: newX, y: newY };
      currentCropRef.current = newCrop;
      setCurrentCrop(newCrop);
      return;
    }

    // 调整大小（resize-nw/ne/sw/se）
    const sc = startCropRef.current;
    const dx = pos.x - startPosRef.current.x;
    const dy = pos.y - startPosRef.current.y;
    let newCrop = { ...sc };

    switch (action) {
      case 'resize-se':
        newCrop.width = Math.max(20, Math.min(sc.width + dx, container.width - sc.x));
        newCrop.height = Math.max(20, Math.min(sc.height + dy, container.height - sc.y));
        break;
      case 'resize-sw':
        newCrop.x = Math.max(0, Math.min(sc.x + dx, sc.x + sc.width - 20));
        newCrop.width = sc.width - (newCrop.x - sc.x);
        newCrop.height = Math.max(20, Math.min(sc.height + dy, container.height - sc.y));
        break;
      case 'resize-ne':
        newCrop.width = Math.max(20, Math.min(sc.width + dx, container.width - sc.x));
        newCrop.y = Math.max(0, Math.min(sc.y + dy, sc.y + sc.height - 20));
        newCrop.height = sc.height - (newCrop.y - sc.y);
        break;
      case 'resize-nw':
        newCrop.x = Math.max(0, Math.min(sc.x + dx, sc.x + sc.width - 20));
        newCrop.width = sc.width - (newCrop.x - sc.x);
        newCrop.y = Math.max(0, Math.min(sc.y + dy, sc.y + sc.height - 20));
        newCrop.height = sc.height - (newCrop.y - sc.y);
        break;
      // 四边中点：仅调整单一方向
      case 'resize-n':
        newCrop.y = Math.max(0, Math.min(sc.y + dy, sc.y + sc.height - 20));
        newCrop.height = sc.height - (newCrop.y - sc.y);
        break;
      case 'resize-s':
        newCrop.height = Math.max(20, Math.min(sc.height + dy, container.height - sc.y));
        break;
      case 'resize-w':
        newCrop.x = Math.max(0, Math.min(sc.x + dx, sc.x + sc.width - 20));
        newCrop.width = sc.width - (newCrop.x - sc.x);
        break;
      case 'resize-e':
        newCrop.width = Math.max(20, Math.min(sc.width + dx, container.width - sc.x));
        break;
    }

    // 如果有宽高比约束，保持比例
    if (aspectRatio && action.startsWith('resize')) {
      newCrop.height = newCrop.width / aspectRatio;
    }

    currentCropRef.current = newCrop;
    setCurrentCrop(newCrop);
  }, [aspectRatio, getRelativePosFromNative, getContainerSize]);

  // document 级别的 mouseup 处理
  const handleDocMouseUp = useCallback(() => {
    const action = dragActionRef.current;
    if (action === 'none') return;

    if (action === 'draw-mosaic') {
      const region = drawingMosaicRef.current;
      if (region && region.width >= 10 && region.height >= 10) {
        onAddMosaic({ ...region });
      }
      drawingMosaicRef.current = null;
      setDrawingMosaic(null);
    } else {
      // 裁切模式完成，同步到父组件
      const finalCrop = currentCropRef.current;
      if (finalCrop.width >= 10 && finalCrop.height >= 10) {
        onCropChange(finalCrop);
      }
    }
    dragActionRef.current = 'none';
    setDragAction('none');
  }, [onCropChange, onAddMosaic]);

  // 在拖动开始时绑定 document 事件，拖动结束时解绑
  useEffect(() => {
    if (dragAction !== 'none') {
      document.addEventListener('mousemove', handleDocMouseMove);
      document.addEventListener('mouseup', handleDocMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleDocMouseMove);
        document.removeEventListener('mouseup', handleDocMouseUp);
      };
    }
  }, [dragAction, handleDocMouseMove, handleDocMouseUp]);

  // 鼠标按下（仅在容器上触发，启动拖动）
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const pos = getRelativePos(e);

    if (mode === 'mosaic') {
      // 马赛克模式：开始绘制马赛克区域
      dragActionRef.current = 'draw-mosaic';
      startPosRef.current = pos;
      drawingMosaicRef.current = { x: pos.x, y: pos.y, width: 0, height: 0 };
      setDragAction('draw-mosaic');
      setStartPos(pos);
      setDrawingMosaic({ x: pos.x, y: pos.y, width: 0, height: 0 });
      return;
    }

    // 裁切模式：判断点击位置
    const cropNow = currentCropRef.current;
    const handle = getHandleAtPos(pos.x, pos.y, cropNow);
    if (handle) {
      // 点击了 handle → 调整大小
      const action = `resize-${handle}` as DragAction;
      dragActionRef.current = action;
      startPosRef.current = pos;
      startCropRef.current = { ...cropNow };
      setDragAction(action);
      setStartPos(pos);
      setStartCrop({ ...cropNow });
      return;
    }

    if (isInsideCrop(pos.x, pos.y, cropNow)) {
      // 点击裁切框内部 → 移动
      dragActionRef.current = 'move';
      startPosRef.current = pos;
      startCropRef.current = { ...cropNow };
      setDragAction('move');
      setStartPos(pos);
      setStartCrop({ ...cropNow });
      return;
    }

    // 点击空白区域 → 绘制新裁切框
    const newCrop = { x: pos.x, y: pos.y, width: 0, height: 0 };
    dragActionRef.current = 'draw-crop';
    startPosRef.current = pos;
    currentCropRef.current = newCrop;
    setDragAction('draw-crop');
    setStartPos(pos);
    setCurrentCrop(newCrop);
  }, [mode, getRelativePos, getHandleAtPos, isInsideCrop]);

  // 动态光标：根据鼠标位置和拖动状态计算光标样式
  const [cursorStyle, setCursorStyle] = useState('crosshair');

  // 容器上的 mousemove 用于更新光标（非拖动时）
  const handleContainerMouseMove = useCallback((e: React.MouseEvent) => {
    // 拖动中不更新光标（由 dragAction 决定）
    if (dragActionRef.current !== 'none') return;
    if (mode !== 'crop') {
      setCursorStyle('crosshair');
      return;
    }
    const pos = getRelativePos(e);
    const cropNow = currentCropRef.current;
    if (cropNow.width < 10 || cropNow.height < 10) {
      setCursorStyle('crosshair');
      return;
    }
    const handle = getHandleAtPos(pos.x, pos.y, cropNow);
    if (handle) {
      setCursorStyle(`${handle}-resize`);
    } else if (isInsideCrop(pos.x, pos.y, cropNow)) {
      setCursorStyle('move');
    } else {
      setCursorStyle('crosshair');
    }
  }, [mode, getRelativePos, getHandleAtPos, isInsideCrop]);

  return (
    <div
      ref={containerRef}
      className={`crop-editor ${mode === 'mosaic' ? 'mosaic-mode' : 'crop-mode'}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleContainerMouseMove}
      style={{ cursor: cursorStyle }}
    >
      <img
        ref={imgRef}
        src={imageSrc}
        alt="Crop preview"
        style={{ transform: `scale(${scale})` }}
        draggable={false}
      />

      {/* 马赛克实时预览 Canvas（覆盖在图片上方） */}
      <canvas
        ref={mosaicCanvasRef}
        className="mosaic-preview-canvas"
      />

      {/* 裁切模式：显示裁切框和 handle（pointer-events: none 确保不拦截鼠标事件） */}
      {mode === 'crop' && currentCrop.width > 0 && currentCrop.height > 0 && (
        <>
          {/* 裁切框外部遮罩（半透明黑色） */}
          <div className="crop-mask-overlay" style={{
            clipPath: `polygon(
              0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%,
              ${currentCrop.x}px ${currentCrop.y}px,
              ${currentCrop.x}px ${currentCrop.y + currentCrop.height}px,
              ${currentCrop.x + currentCrop.width}px ${currentCrop.y + currentCrop.height}px,
              ${currentCrop.x + currentCrop.width}px ${currentCrop.y}px,
              ${currentCrop.x}px ${currentCrop.y}px
            )`
          }} />
          <div
            className="crop-box"
            style={{
              left: currentCrop.x,
              top: currentCrop.y,
              width: currentCrop.width,
              height: currentCrop.height,
              pointerEvents: 'none', // 不拦截事件，由容器统一处理
            }}
          >
            {/* 四个角的拖拽 handle */}
            <div className="crop-handle nw" />
            <div className="crop-handle ne" />
            <div className="crop-handle sw" />
            <div className="crop-handle se" />
            {/* 四条边的中点 handle */}
            <div className="crop-handle n" />
            <div className="crop-handle s" />
            <div className="crop-handle w" />
            <div className="crop-handle e" />
          </div>
        </>
      )}

      {/* 马赛克区域删除按钮（浮在 canvas 上方） */}
      {mosaicRegions.map((region, idx) => (
        <button
          key={idx}
          className="mosaic-region-delete"
          style={{
            left: region.x + region.width - 10,
            top: region.y - 10,
          }}
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); onRemoveMosaic(idx); }}
          onMouseDown={(e) => e.stopPropagation()}
          title={`删除马赛克区域 ${idx + 1}`}
        >✕</button>
      ))}
    </div>
  );
};

export default ImageUploader;