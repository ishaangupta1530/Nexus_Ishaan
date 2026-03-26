import { FC, MouseEvent, RefObject, useState } from 'react';
import { Button, Menu, MenuItem } from '@mui/material';
import FileDownloadIcon from '@mui/icons-material/FileDownload';

interface ExportButtonProps {
  containerRef: RefObject<HTMLElement | null>;
  fileName: string;
}

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const exportSvg = (svgEl: SVGSVGElement, fileName: string) => {
  const serializer = new XMLSerializer();
  const raw = serializer.serializeToString(svgEl);
  const blob = new Blob([raw], { type: 'image/svg+xml;charset=utf-8' });
  downloadBlob(blob, `${fileName}.svg`);
};

const exportPng = async (svgEl: SVGSVGElement, fileName: string) => {
  const serializer = new XMLSerializer();
  const raw = serializer.serializeToString(svgEl);
  const svgBlob = new Blob([raw], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);

  const image = new Image();
  image.crossOrigin = 'anonymous';

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Failed to load SVG for PNG export'));
    image.src = svgUrl;
  });

  const rect = svgEl.getBoundingClientRect();
  const scale = 3; // High quality output
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(rect.width * scale));
  canvas.height = Math.max(1, Math.floor(rect.height * scale));

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    URL.revokeObjectURL(svgUrl);
    throw new Error('Canvas context unavailable');
  }

  ctx.scale(scale, scale);
  ctx.drawImage(image, 0, 0, rect.width, rect.height);

  URL.revokeObjectURL(svgUrl);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/png', 1),
  );

  if (!blob) throw new Error('Failed to generate PNG blob');
  downloadBlob(blob, `${fileName}.png`);
};

const ExportButton: FC<ExportButtonProps> = ({ containerRef, fileName }) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleExport = async (format: 'png' | 'svg') => {
    handleClose();
    const root = containerRef.current;
    if (!root) return;
    const svgEl = root.querySelector('svg');
    if (!svgEl) return;

    if (format === 'svg') {
      exportSvg(svgEl, fileName);
    } else {
      await exportPng(svgEl, fileName);
    }
  };

  return (
    <>
      <Button
        variant="outlined"
        size="small"
        startIcon={<FileDownloadIcon fontSize="small" />}
        onClick={handleClick}
        aria-label="Export current chart as PNG or SVG"
        sx={{
          minHeight: 44,
          '&:focus-visible': {
            outline: '2px solid',
            outlineColor: 'primary.main',
            outlineOffset: 2,
          },
        }}
      >
        Export Chart
      </Button>
      <Menu anchorEl={anchorEl} open={open} onClose={handleClose}>
        <MenuItem sx={{ minHeight: 44 }} onClick={() => { void handleExport('png'); }}>PNG</MenuItem>
        <MenuItem sx={{ minHeight: 44 }} onClick={() => { void handleExport('svg'); }}>SVG</MenuItem>
      </Menu>
    </>
  );
};

export default ExportButton;
