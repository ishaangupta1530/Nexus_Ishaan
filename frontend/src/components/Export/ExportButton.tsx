import { FC, useState, useRef, useEffect } from 'react';
import {
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Stack,
  CircularProgress,
  Alert,
  Box,
  Chip,
  Typography,
  LinearProgress,
  Tooltip,
} from '@mui/material';
import {
  Download as DownloadIcon,
  GetApp as GetAppIcon,
} from '@mui/icons-material';
import { useNotification } from '@/contexts/NotificationContext';
import { apiService } from '@/services/api';

interface ExportButtonProps {
  exportType: 'ANALYTICS' | 'REFERRALS' | 'CONNECTIONS' | 'CUSTOM';
  pageTitle?: string;
  filters?: Record<string, unknown>;
  isCompact?: boolean; // For mobile-friendly compact button
}

interface ExportJob {
  jobId: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  progress: number;
  fileUrl?: string;
  fileSize?: number;
  error?: string;
}

const ExportButton: FC<ExportButtonProps> = ({
  exportType,
  pageTitle = 'Export',
  filters,
  isCompact = false,
}) => {
  const [openDialog, setOpenDialog] = useState(false);
  const [format, setFormat] = useState<'CSV' | 'PDF' | 'EXCEL' | 'JSON'>('CSV');
  const [exporting, setExporting] = useState(false);
  const [exportJob, setExportJob] = useState<ExportJob | null>(null);
  const { showNotification } = useNotification();
  const pollingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const downloadTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup timeouts on component unmount or dialog close
  useEffect(() => {
    return () => {
      if (pollingTimeoutRef.current) clearTimeout(pollingTimeoutRef.current);
      if (downloadTimeoutRef.current) clearTimeout(downloadTimeoutRef.current);
    };
  }, []);

  const formatOptions = [
    { value: 'CSV', label: 'CSV (.csv)' },
    { value: 'PDF', label: 'PDF (.pdf)' },
    { value: 'EXCEL', label: 'Excel (.xlsx)' },
    { value: 'JSON', label: 'JSON (.json)' },
  ];

  const handleOpenDialog = () => setOpenDialog(true);
  const handleCloseDialog = () => {
    // Clear any pending timeouts
    if (pollingTimeoutRef.current) clearTimeout(pollingTimeoutRef.current);
    if (downloadTimeoutRef.current) clearTimeout(downloadTimeoutRef.current);
    setOpenDialog(false);
    setExportJob(null);
  };

  const handleExport = async () => {
    try {
      setExporting(true);

      // Request export from backend
      const response = await apiService.export.request({
        type: exportType,
        format,
        filters,
      });

      const jobId = response.data.jobId;
      setExportJob({
        jobId,
        status: 'PENDING',
        progress: 0,
      });

      showNotification?.('Export started. Processing your data...', 'info');

      // Poll for status
      await pollExportStatus(jobId);
    } catch (error) {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message || 'Failed to start export';
      showNotification?.(message, 'error');
      setExporting(false);
    }
  };

  const pollExportStatus = async (jobId: string, attempts = 0) => {
    const maxAttempts = 120; // 2 minutes with 1s intervals

    if (attempts >= maxAttempts) {
      showNotification?.('Export timeout. Please try again.', 'error');
      setExporting(false);
      return;
    }

    try {
      const response = await apiService.export.getStatus(jobId);
      const status = response.data;

      setExportJob({
        jobId,
        status: status.status,
        progress: status.progress || 0,
        fileUrl: status.fileUrl,
        fileSize: status.fileSize,
        error: status.error,
      });

      if (status.status === 'COMPLETED') {
        setExporting(false);
        showNotification?.('Export completed! Ready to download.', 'success');
        // Auto-download after 1s
        downloadTimeoutRef.current = setTimeout(() => handleDownload(jobId), 1000);
      } else if (status.status === 'FAILED') {
        setExporting(false);
        showNotification?.(`Export failed: ${status.error}`, 'error');
      } else {
        // Continue polling
        pollingTimeoutRef.current = setTimeout(() => pollExportStatus(jobId, attempts + 1), 1000);
      }
    } catch (_error) {
      console.error('Failed to check export status:', _error);
      showNotification?.('Failed to check export status', 'error');
      setExporting(false);
    }
  };

  const handleDownload = async (jobId: string) => {
    try {
      const response = await apiService.export.download(jobId);

      // Create blob from response
      const blob = new Blob([response.data], {
        type: response.headers['content-type'] || 'application/octet-stream',
      });

      // Extract filename from Content-Disposition header or generate one
      const contentDisposition = response.headers['content-disposition'];
      let filename = `${exportType}_export.${getFileExtension(format)}`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]*)"?/);
        if (match) filename = match[1];
      }

      // Create download link and trigger click
      const url = globalThis.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      globalThis.URL.revokeObjectURL(url);

      showNotification?.('Export downloaded successfully!', 'success');
      handleCloseDialog();
    } catch (error) {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message || 'Failed to download export';
      showNotification?.(message, 'error');
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'N/A';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const getFileExtension = (format: string): string => {
    const extensionMap: Record<string, string> = {
      CSV: 'csv',
      PDF: 'pdf',
      EXCEL: 'xlsx',
      JSON: 'json',
    };
    return extensionMap[format] || format.toLowerCase();
  };

  const getStatusColor = (status: string) => {
    if (status === 'COMPLETED') return 'success';
    if (status === 'FAILED') return 'error';
    return 'info';
  };

  const renderActionButton = () => {
    if (exportJob?.status === 'COMPLETED') {
      return (
        <Button
          variant="contained"
          onClick={() => handleDownload(exportJob.jobId)}
          startIcon={<GetAppIcon />}
        >
          Download Now
        </Button>
      );
    }
    if (exportJob?.status === 'FAILED') {
      return (
        <Button variant="contained" onClick={handleExport}>
          Retry Export
        </Button>
      );
    }
    return (
      <Button
        variant="contained"
        onClick={handleExport}
        disabled={exporting}
        startIcon={exporting && <CircularProgress size={20} />}
      >
        {exporting ? 'Exporting...' : 'Start Export'}
      </Button>
    );
  };

  return (
    <>
      {/* Export Button */}
      <Tooltip title={`Export ${exportType.toLowerCase()} data`}>
        <Button
          variant={isCompact ? 'outlined' : 'contained'}
          size={isCompact ? 'small' : 'medium'}
          startIcon={isCompact ? <DownloadIcon /> : <GetAppIcon />}
          onClick={handleOpenDialog}
          disabled={exporting}
          sx={{
            textTransform: 'none',
            fontWeight: 500,
          }}
        >
          {isCompact ? 'Export' : 'Export Data'}
        </Button>
      </Tooltip>

      {/* Export Dialog */}
      <Dialog
        open={openDialog}
        onClose={handleCloseDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Export {pageTitle || exportType}</DialogTitle>

        <DialogContent>
          <Stack spacing={3} sx={{ mt: 2 }}>
            {/* Status section */}
            {exportJob && (
              <Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Status:{' '}
                  <Chip
                    label={exportJob.status}
                    size="small"
                    color={getStatusColor(exportJob.status)}
                    variant="outlined"
                  />
                </Typography>

                {exportJob.status !== 'COMPLETED' &&
                  exportJob.status !== 'FAILED' && (
                    <>
                      <LinearProgress
                        variant="determinate"
                        value={exportJob.progress}
                        sx={{ mt: 1, mb: 1 }}
                      />
                      <Typography variant="caption" color="text.secondary">
                        {exportJob.progress}% complete
                      </Typography>
                    </>
                  )}

                {exportJob.status === 'COMPLETED' && (
                  <Alert severity="success" sx={{ mt: 1 }}>
                    Export completed! File size:{' '}
                    {formatFileSize(exportJob.fileSize)}
                  </Alert>
                )}

                {exportJob.status === 'FAILED' && (
                  <Alert severity="error" sx={{ mt: 1 }}>
                    {exportJob.error || 'Export failed. Please try again.'}
                  </Alert>
                )}
              </Box>
            )}

            {/* Format selection - only show when not processing */}
            {!exporting && !exportJob && (
              <FormControl fullWidth>
                <InputLabel>Export Format</InputLabel>
                <Select
                  value={format}
                  onChange={(e) => setFormat(e.target.value as 'CSV' | 'PDF' | 'EXCEL' | 'JSON')}
                  label="Export Format"
                >
                  {formatOptions.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            {/* Help text */}
            <Box sx={{ bgcolor: 'action.hover', p: 1.5, borderRadius: 1 }}>
              <Typography variant="caption" color="text.secondary">
                <strong>Format Details:</strong>
                <br />• <strong>CSV</strong>: Universal spreadsheet format
                <br />• <strong>Excel</strong>: Formatted with multiple sheets
                <br />• <strong>PDF</strong>: Professional report
                <br />• <strong>JSON</strong>: Structured data format
              </Typography>
            </Box>
          </Stack>
        </DialogContent>

        <DialogActions sx={{ p: 2 }}>
          <Button onClick={handleCloseDialog} disabled={exporting}>
            Cancel
          </Button>

          {renderActionButton()}
        </DialogActions>
      </Dialog>
    </>
  );
};

export default ExportButton;
