// Public API của @kb/ui. App chỉ import từ đây (và "@kb/ui/styles.css", "@kb/ui/theme").
export { cn } from "./lib/cn.js";
export { Button, buttonVariants, type ButtonProps } from "./components/button.js";
export { Spinner, type SpinnerProps } from "./components/spinner.js";
export { Field, FieldFrame, Label, useFieldControl, type FieldFrameProps, type FieldProps } from "./components/field.js";
export { Abbreviation, type AbbreviationProps } from "./components/abbreviation.js";
export { PaperStack, PaperSheet, PaperField, type PaperSheetProps, type PaperFieldProps, type PaperFieldState } from "./components/paper.js";
export { Disclosure, type DisclosureProps } from "./components/disclosure.js";
export { Input, Textarea, Select, Checkbox, type SelectOption, type SelectProps, type CheckboxProps } from "./components/inputs.js";
export { RadioGroup, type RadioGroupProps, type RadioOption } from "./components/radio-group.js";
export {
  Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter,
  Grid, Stack, PageHeader,
  type GridProps, type StackProps, type PageHeaderProps,
} from "./components/layout.js";
export {
  Badge, badgeVariants, StatusBadge, STATUS_META, Alert, Skeleton, EmptyState,
  type BadgeProps, type Tone, type Status, type StatusBadgeProps, type AlertProps, type EmptyStateProps,
} from "./components/feedback.js";
export { Tabs, TabsList, TabsTrigger, TabsContent } from "./components/overlay.js";
export {
  Dialog, DialogTrigger, DialogClose, DialogContent, DialogFooter,
  type DialogProps, type DialogContentProps, type DialogPresentation,
} from "./components/dialog.js";
export {
  AssistantPanel, AssistantLauncher, AssistantWelcome, SuggestionChips, ChatMessage, ChatComposer,
  type AssistantPanelProps, type AssistantLauncherProps, type AssistantMode, type ChatMessageProps, type ChatComposerProps,
} from "./components/assistant.js";
export { RobotAvatar, type RobotAvatarProps, type RobotAvatarState } from "./components/robot-avatar.js";
export {
  SegmentedControl, ColorSwatchPicker,
  type SegmentOption, type SegmentedControlProps, type Swatch, type ColorSwatchPickerProps,
} from "./components/choice.js";
export { AppearancePanel, type AppearancePanelProps } from "./components/appearance-panel.js";
export {
  Sidebar, SidebarFooterButton, SidebarUser, SidebarMobileTrigger, BrandDot, useSidebar,
  type NavItem, type SidebarPosition, type SidebarProps, type SidebarFooterButtonProps, type SidebarUserProps,
} from "./components/sidebar.js";
export {
  Stepper, WorkflowDiagram, layoutWorkflow,
  type StepperProps, type StepperStep, type WorkflowDiagramProps, type FlowNode, type FlowEdge, type FlowNodeKind, type FlowNodeStatus,
} from "./components/workflow.js";
export { UiLocaleProvider, useUiLocale, useMessages, intlLocale, type UiLocale, type Messages } from "./lib/i18n.js";
export {
  DataTable, createDataTableColumnHelper, dataTableFeatures,
  type DataTableProps, type DataTableColumn, type DataTableColumnMeta, type DataTablePagination, type DataTableFeatures,
  type DataTableColumnSizing, type DataTableColumnVisibility,
} from "./components/data-table.js";
export { Pagination, getPageItems, type PaginationProps, type PageItem } from "./components/pagination.js";
export { Toaster, toast, updateToast, toastPromise, dismissToast, useToast, type ToastOptions, type ToastTone, type ToasterProps } from "./components/toast.js";
export { Tooltip, TooltipProvider, type TooltipProps } from "./components/tooltip.js";
export {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuGroup,
  DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent,
  Popover, PopoverTrigger, PopoverContent, PopoverClose, PopoverAnchor,
  type DropdownMenuItemProps, type PopoverContentProps,
} from "./components/menu.js";
export {
  FileDropzone, FileUploadList, formatBytes,
  type FileDropzoneProps, type FileUploadListProps, type UploadItem, type UploadStatus, type RejectedFile, type RejectReason,
} from "./components/upload.js";
export { Progress, type ProgressProps } from "./components/progress.js";
export { Avatar, AvatarGroup, initialsOf, type AvatarProps, type AvatarGroupProps } from "./components/avatar.js";
export { Switch, type SwitchProps } from "./components/switch.js";
export { Breadcrumb, type BreadcrumbProps, type BreadcrumbItem } from "./components/breadcrumb.js";
export {
  Combobox, foldVietnamese, matchesSearch, buildSearchIndex, searchOptions,
  type ComboboxProps, type ComboboxOption, type ComboboxSearchIndex,
} from "./components/combobox.js";
export {
  DatePicker, DateRangePicker, isoToDate, dateToIso, formatIsoDate, parseTypedDate,
  type DatePickerProps, type DateRangePickerProps, type IsoDateRange,
} from "./components/date-picker.js";
export { DocumentViewer, DOCUMENT_PAGE_WIDTH, type DocumentViewerProps, type DocumentRegion } from "./components/document-viewer.js";
export { AiBackdrop, AiScanCard, type AiBackdropProps, type AiScanCardProps, type AiScanField } from "./components/ai-visuals.js";
export { CountUp, type CountUpProps } from "./components/count-up.js";
export { BrandMark, type BrandMarkProps } from "./components/brand-mark.js";
export { StatCard, type StatCardProps } from "./components/stat-card.js";
export { IconTile, type IconTileProps } from "./components/icon-tile.js";
export { FormSection, type FormSectionProps } from "./components/form-section.js";
export { RowActions, type RowAction, type RowActionsProps } from "./components/row-actions.js";
export {
  Loader, LoadingDots, LoadingOverlay, LoadingState, PageLoading, SkeletonCard, SkeletonForm, SkeletonList, SkeletonStats, SkeletonTable, SkeletonText,
  type LoaderProps, type LoadingOverlayProps, type LoadingStateProps, type PageLoadingProps,
} from "./components/loading.js";
