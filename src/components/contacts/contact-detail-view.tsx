'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { addContactTag, deleteContactTag } from '@/lib/contacts/tag-api';
import { useAuth } from '@/hooks/use-auth';
import { formatCurrency } from '@/lib/currency';
import { toast } from 'sonner';
import type {
  Contact,
  Tag,
  ContactTag,
  ContactNote,
  CustomField,
  ContactCustomValue,
  Deal,
  MessageTemplate,
} from '@/types';
import {
  TemplatePicker,
  type TemplateSendValues,
} from '@/components/inbox/template-picker';
import { CompanySelector } from '@/components/companies/company-selector';
import { ActivityTimeline } from '@/components/activities/activity-timeline';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Phone,
  Mail,
  Building2,
  Copy,
  Check,
  Loader2,
  Plus,
  Trash2,
  Save,
  X,
  DollarSign,
  LayoutTemplate,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

interface ContactDetailViewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: string | null;
  onUpdated: () => void;
}

export function ContactDetailView({
  open,
  onOpenChange,
  contactId,
  onUpdated,
}: ContactDetailViewProps) {
  const t = useTranslations('Contacts.detailView');
  const { accountId, defaultCurrency } = useAuth();
  const abortControllerRef = useRef<AbortController | null>(null);

  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);

  // Send template — lets the business initiate (or re-open) a conversation
  // with this contact by sending an approved template. The send route
  // find-or-creates the conversation, so no inbound message is required.
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [sendingTemplate, setSendingTemplate] = useState(false);

  // Details tab
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editCompany, setEditCompany] = useState('');
  const [editCompanyId, setEditCompanyId] = useState<string | null>('');
  const [savingDetails, setSavingDetails] = useState(false);

  // Tags tab
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [contactTagIds, setContactTagIds] = useState<string[]>([]);
  const [savingTags, setSavingTags] = useState(false);

  // Notes tab
  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [loadingNotes, setLoadingNotes] = useState(false);

  // Custom fields tab
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [savingCustom, setSavingCustom] = useState(false);
  const [loadingCustom, setLoadingCustom] = useState(false);

  // Deals tab
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loadingDeals, setLoadingDeals] = useState(false);

  // Tasks tab
  const [tasks, setTasks] = useState<any[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);

  // Conversations tab
  const [conversations, setConversations] = useState<any[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(false);

  // Calls tab
  const [calls, setCalls] = useState<any[]>([]);
  const [loadingCalls, setLoadingCalls] = useState(false);

  const fetchContact = useCallback(
    async (signal?: AbortSignal) => {
      if (!contactId) return;
      setLoading(true);
      try {
        const res = await fetch(`/api/zenith/contacts/${contactId}`, {
          signal,
        });
        if (res.ok) {
          const data = await res.json();
          setContact(data);
          setEditName(data.name ?? '');
          setEditPhone(data.phone);
          setEditEmail(data.email ?? '');
          setEditCompany(data.company ?? '');
          setEditCompanyId(data.company_id ?? '');
        }
      } catch (e: any) {
        if (e.name !== 'AbortError') console.error(e);
      }
      setLoading(false);
    },
    [contactId]
  );

  const fetchTags = useCallback(
    async (signal?: AbortSignal) => {
      if (!contactId) return;
      try {
        const [tagsRes, contactTagsRes] = await Promise.all([
          fetch('/api/zenith/tags', { signal }),
          fetch(`/api/zenith/contacts/${contactId}/tags`, { signal }),
        ]);

        if (tagsRes.ok) {
          const data = await tagsRes.json();
          setAllTags(data.items || data || []);
        }
        if (contactTagsRes.ok) {
          const data = await contactTagsRes.json();
          // Assume data returns { items: [{ tag_id: '...' }] } or similar array
          setContactTagIds(
            (data.items || data).map((ct: any) => ct.tag_id || ct.id)
          );
        }
      } catch (e: any) {
        if (e.name !== 'AbortError') console.error(e);
      }
    },
    [contactId]
  );

  const fetchNotes = useCallback(
    async (signal?: AbortSignal) => {
      if (!contactId) return;
      setLoadingNotes(true);

      try {
        const res = await fetch(`/api/zenith/notes?contactId=${contactId}`, {
          signal,
        });
        if (res.ok) {
          const data = await res.json();
          setNotes(data);
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') console.error(err);
      }
      setLoadingNotes(false);
    },
    [contactId]
  );

  const fetchCustomFields = useCallback(
    async (signal?: AbortSignal) => {
      if (!contactId) return;
      setLoadingCustom(true);
      try {
        const res = await fetch(
          `/api/zenith/contacts/${contactId}/custom-fields`,
          { signal }
        );
        if (res.ok) {
          const data = await res.json();
          setCustomFields(data.fields || []);

          const map: Record<string, string> = {};
          (data.values || []).forEach((v: any) => {
            map[v.custom_field_id] = v.value ?? '';
          });
          setCustomValues(map);
        }
      } catch (e: any) {
        if (e.name !== 'AbortError') console.error(e);
      }
      setLoadingCustom(false);
    },
    [contactId]
  );

  const fetchDeals = useCallback(
    async (signal?: AbortSignal) => {
      if (!contactId) return;
      setLoadingDeals(true);
      try {
        const res = await fetch(`/api/zenith/deals?contactId=${contactId}`, {
          signal,
        });
        if (res.ok) {
          const data = await res.json();
          setDeals(data);
        }
      } catch (e: any) {
        if (e.name !== 'AbortError') console.error(e);
      }
      setLoadingDeals(false);
    },
    [contactId]
  );

  const fetchTasks = useCallback(
    async (signal?: AbortSignal) => {
      if (!contactId) return;
      setLoadingTasks(true);
      try {
        const res = await fetch(`/api/zenith/tasks?contactId=${contactId}`, {
          signal,
        });
        if (res.ok) {
          const data = await res.json();
          setTasks(data);
        }
      } catch (e: any) {
        if (e.name !== 'AbortError') console.error(e);
      }
      setLoadingTasks(false);
    },
    [contactId]
  );

  const fetchConversations = useCallback(
    async (signal?: AbortSignal) => {
      if (!contactId) return;
      setLoadingConversations(true);
      try {
        // Endpoint depends on architecture, maybe /api/zenith/conversations?contactId=...
        const res = await fetch(
          `/api/zenith/conversations?contactId=${contactId}`,
          { signal }
        );
        if (res.ok) {
          const data = await res.json();
          setConversations(data.items || data || []);
        }
      } catch (e: any) {
        if (e.name !== 'AbortError') console.error(e);
      }
      setLoadingConversations(false);
    },
    [contactId]
  );

  const fetchCalls = useCallback(
    async (signal?: AbortSignal) => {
      if (!contactId) return;
      setLoadingCalls(true);
      try {
        const res = await fetch(`/api/zenith/calls?contactId=${contactId}`, {
          signal,
        });
        if (res.ok) {
          const data = await res.json();
          setCalls(data.items || data || []);
        }
      } catch (e: any) {
        if (e.name !== 'AbortError') console.error(e);
      }
      setLoadingCalls(false);
    },
    [contactId]
  );

  useEffect(() => {
    if (open && contactId) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const { signal } = controller;

      fetchContact(signal);
      fetchTags(signal);
      fetchNotes(signal);
      fetchCustomFields(signal);
      fetchDeals(signal);
      fetchTasks(signal);
      fetchConversations(signal);
      fetchCalls(signal);

      return () => {
        controller.abort();
      };
    }
  }, [
    open,
    contactId,
    fetchContact,
    fetchTags,
    fetchNotes,
    fetchCustomFields,
    fetchDeals,
    fetchTasks,
    fetchConversations,
    fetchCalls,
  ]);

  async function copyPhone() {
    if (!contact) return;
    await navigator.clipboard.writeText(contact.phone);
    setCopiedPhone(true);
    setTimeout(() => setCopiedPhone(false), 2000);
  }

  async function saveDetails() {
    if (!contactId || !editPhone.trim()) {
      toast.error(t('toastPhoneRequired'));
      return;
    }

    setSavingDetails(true);
    try {
      const res = await fetch(`/api/zenith/contacts/${contactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim() || null,
          phone: editPhone.trim(),
          email: editEmail.trim() || null,
          company: editCompany.trim() || null,
          company_id: editCompanyId || null,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to save details');
      }

      toast.success(t('toastUpdated'));
      fetchContact();
      onUpdated();
    } catch {
      toast.error(t('toastUpdateFailed'));
    }
    setSavingDetails(false);
  }

  async function toggleTag(tagId: string) {
    if (!contactId) return;
    setSavingTags(true);

    const isSelected = contactTagIds.includes(tagId);

    try {
      if (isSelected) {
        await deleteContactTag(contactId, tagId);
        setContactTagIds((prev) => prev.filter((id) => id !== tagId));
      } else {
        await addContactTag(contactId, tagId);
        setContactTagIds((prev) => [...prev, tagId]);
      }
      onUpdated();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t('toastUpdateFailed')
      );
    }
    setSavingTags(false);
  }

  async function addNote() {
    if (!contactId || !newNote.trim()) return;
    setSavingNote(true);

    try {
      const res = await fetch('/api/zenith/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: newNote.trim(),
          contactId: contactId,
        }),
      });

      if (!res.ok) {
        toast.error(t('toastNoteAddFailed'));
      } else {
        setNewNote('');
        fetchNotes();
        toast.success(t('toastNoteAdded'));
      }
    } catch (err) {
      toast.error(t('toastNoteAddFailed'));
    }
    setSavingNote(false);
  }

  async function deleteNote(noteId: string) {
    // Delete note currently not implemented in API, fallback to UI hiding if needed,
    // or we can just comment it out since notes shouldn't be deleted per requirements.
    // For now we'll just show an error.
    toast.error('Delete note is not supported in this version.');
  }

  async function saveCustomFields() {
    if (!contactId) return;
    setSavingCustom(true);

    try {
      const res = await fetch(
        `/api/zenith/contacts/${contactId}/custom-fields`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: customValues }),
        }
      );

      if (!res.ok) throw new Error('Failed to save custom fields');

      toast.success(t('toastCustomFieldsSaved'));
    } catch {
      toast.error(t('toastCustomFieldsFailed'));
    }
    setSavingCustom(false);
  }

  async function handleSendTemplate(
    template: MessageTemplate,
    values: TemplateSendValues
  ) {
    if (!contactId) return;
    setSendingTemplate(true);
    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // No conversation_id — the route find-or-creates one for this
          // contact, mirroring the inbox template-send payload otherwise.
          contact_id: contactId,
          message_type: 'template',
          template_name: template.name,
          template_language: template.language,
          template_message_params: {
            body: values.body,
            headerText: values.headerText,
            buttonParams: values.buttonParams,
          },
          template_params: values.body,
        }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        const reason = payload?.error || `HTTP ${res.status}`;
        toast.error(t('toastTemplateFailed', { reason }));
        return;
      }

      toast.success(t('toastTemplateSent', { name: template.name }));
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'network error';
      toast.error(`Failed to send template: ${reason}`);
    } finally {
      setSendingTemplate(false);
    }
  }

  function getInitials(name?: string | null) {
    if (!name) return '?';
    return name
      .split(' ')
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="bg-popover border-border text-popover-foreground w-full p-0 sm:max-w-lg"
        >
          {loading || !contact ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="text-primary size-6 animate-spin" />
            </div>
          ) : (
            <div className="flex h-full flex-col">
              {/* Header */}
              <SheetHeader className="border-border/50 border-b p-4">
                <div className="flex items-center gap-3">
                  <Avatar className="bg-muted border-border size-12 border">
                    <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                      {getInitials(contact.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <SheetTitle className="text-popover-foreground truncate">
                      {contact.name || t('unnamed')}
                    </SheetTitle>
                    <SheetDescription className="text-muted-foreground mt-0.5 text-xs">
                      {t('contactDetailsDesc')}
                    </SheetDescription>
                    <div className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-3 text-xs">
                      <button
                        onClick={copyPhone}
                        className="hover:text-primary flex cursor-pointer items-center gap-1 transition-colors"
                      >
                        <Phone className="size-3" />
                        {contact.phone}
                        {copiedPhone ? (
                          <Check className="text-primary size-3" />
                        ) : (
                          <Copy className="size-3" />
                        )}
                      </button>
                      {contact.email && (
                        <span className="flex items-center gap-1">
                          <Mail className="size-3" />
                          {contact.email}
                        </span>
                      )}
                      {contact.company && (
                        <span className="flex items-center gap-1">
                          <Building2 className="size-3" />
                          {contact.company}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="mt-3">
                  <Button
                    size="sm"
                    onClick={() => setTemplatePickerOpen(true)}
                    disabled={sendingTemplate}
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    {sendingTemplate ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <LayoutTemplate className="size-4" />
                    )}
                    {t('sendTemplateBtn')}
                  </Button>
                </div>
              </SheetHeader>

              {/* Tabs */}
              <Tabs
                defaultValue="details"
                className="flex min-h-0 flex-1 flex-col"
              >
                <TabsList className="bg-muted/50 border-border mx-4 mt-3 border-b">
                  <TabsTrigger
                    value="details"
                    className="data-active:bg-muted data-active:text-primary text-muted-foreground"
                  >
                    {t('tabs.details')}
                  </TabsTrigger>
                  <TabsTrigger
                    value="tags"
                    className="data-active:bg-muted data-active:text-primary text-muted-foreground"
                  >
                    {t('tabs.tags')}
                  </TabsTrigger>
                  <TabsTrigger
                    value="notes"
                    className="data-active:bg-muted data-active:text-primary text-muted-foreground"
                  >
                    {t('tabs.notes')}
                  </TabsTrigger>
                  <TabsTrigger
                    value="custom"
                    className="data-active:bg-muted data-active:text-primary text-muted-foreground"
                  >
                    {t('tabs.custom')}
                  </TabsTrigger>
                  <TabsTrigger
                    value="deals"
                    className="data-active:bg-muted data-active:text-primary text-muted-foreground"
                  >
                    {t('tabs.deals')}
                  </TabsTrigger>
                  <TabsTrigger
                    value="tasks"
                    className="data-active:bg-muted data-active:text-primary text-muted-foreground"
                  >
                    Tasks
                  </TabsTrigger>
                  <TabsTrigger
                    value="conversations"
                    className="data-active:bg-muted data-active:text-primary text-muted-foreground"
                  >
                    Conversations
                  </TabsTrigger>
                  <TabsTrigger
                    value="calls"
                    className="data-active:bg-muted data-active:text-primary text-muted-foreground"
                  >
                    Calls
                  </TabsTrigger>
                  <TabsTrigger
                    value="activities"
                    className="data-active:bg-muted data-active:text-primary text-muted-foreground"
                  >
                    Activities
                  </TabsTrigger>
                </TabsList>

                {/* Details Tab */}
                <TabsContent
                  value="details"
                  className="flex-1 overflow-y-auto px-4 py-3"
                >
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-muted-foreground text-xs">
                        {t('name')}
                      </Label>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="bg-muted border-border text-foreground h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-muted-foreground text-xs">
                        {t('phone')} <span className="text-red-400">*</span>
                      </Label>
                      <Input
                        value={editPhone}
                        onChange={(e) => setEditPhone(e.target.value)}
                        className="bg-muted border-border text-foreground h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-muted-foreground text-xs">
                        {t('email')}
                      </Label>
                      <Input
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        className="bg-muted border-border text-foreground h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-muted-foreground text-xs">
                        {t('company')}
                      </Label>
                      <Input
                        value={editCompany}
                        onChange={(e) => setEditCompany(e.target.value)}
                        className="bg-muted border-border text-foreground h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-muted-foreground text-xs">
                        {t('companyEntityLabel', {
                          fallback: 'Empresa Vinculada',
                        })}
                      </Label>
                      <CompanySelector
                        value={editCompanyId}
                        onChange={setEditCompanyId}
                      />
                    </div>
                    <Button
                      onClick={saveDetails}
                      disabled={savingDetails}
                      className="bg-primary hover:bg-primary/90 text-primary-foreground w-full"
                      size="sm"
                    >
                      {savingDetails ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Save className="size-3.5" />
                      )}
                      {t('saveChangesBtn')}
                    </Button>
                  </div>
                </TabsContent>

                {/* Tags Tab */}
                <TabsContent
                  value="tags"
                  className="flex-1 overflow-y-auto px-4 py-3"
                >
                  <div className="space-y-3">
                    <p className="text-muted-foreground text-xs">
                      {t('tagsTab.clickTagDesc')}
                    </p>
                    {allTags.length === 0 ? (
                      <p className="text-muted-foreground text-sm">
                        {t('tagsTab.noTagsAvailable')}
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {allTags.map((tag) => {
                          const selected = contactTagIds.includes(tag.id);
                          return (
                            <button
                              key={tag.id}
                              onClick={() => toggleTag(tag.id)}
                              disabled={savingTags}
                              className={`inline-flex cursor-pointer items-center rounded-full px-3 py-1 text-xs font-medium transition-all ${
                                selected
                                  ? 'ring-primary ring-offset-border ring-2 ring-offset-1'
                                  : 'opacity-50 hover:opacity-80'
                              }`}
                              style={{
                                backgroundColor: tag.color + '20',
                                color: tag.color,
                              }}
                            >
                              {selected && <Check className="mr-1 size-3" />}
                              {tag.name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* Notes Tab */}
                <TabsContent
                  value="notes"
                  className="flex min-h-0 flex-1 flex-col px-4 py-3"
                >
                  <div className="mb-3 space-y-2">
                    <Textarea
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      placeholder={t('notesTab.placeholder')}
                      className="bg-muted border-border text-foreground placeholder:text-muted-foreground min-h-[60px] resize-none text-sm"
                    />
                    <Button
                      onClick={addNote}
                      disabled={!newNote.trim() || savingNote}
                      className="bg-primary hover:bg-primary/90 text-primary-foreground"
                      size="sm"
                    >
                      {savingNote ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Plus className="size-3.5" />
                      )}
                      {t('notesTab.save')}
                    </Button>
                  </div>

                  <div className="flex-1 space-y-2 overflow-y-auto">
                    {loadingNotes ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="text-muted-foreground size-5 animate-spin" />
                      </div>
                    ) : notes.length === 0 ? (
                      <p className="text-muted-foreground py-8 text-center text-sm">
                        {t('notesTab.noNotes')}
                      </p>
                    ) : (
                      notes.map((note) => (
                        <div
                          key={note.id}
                          className="bg-muted/50 border-border/50 group rounded-lg border p-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-muted-foreground flex-1 text-sm whitespace-pre-wrap">
                              {note.note_text}
                            </p>
                            <button
                              onClick={() => deleteNote(note.id)}
                              className="text-muted-foreground shrink-0 cursor-pointer opacity-0 transition-all group-hover:opacity-100 hover:text-red-400"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                          <p className="text-muted-foreground mt-1.5 text-xs">
                            {new Date(note.created_at).toLocaleDateString(
                              'en-US',
                              {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              }
                            )}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </TabsContent>

                {/* Activities Tab */}
                <TabsContent
                  value="activities"
                  className="flex-1 overflow-y-auto px-4 py-3"
                >
                  <ActivityTimeline contactId={contactId} />
                </TabsContent>

                {/* Custom Fields Tab */}
                <TabsContent
                  value="custom"
                  className="flex-1 overflow-y-auto px-4 py-3"
                >
                  {loadingCustom ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="text-muted-foreground size-5 animate-spin" />
                    </div>
                  ) : customFields.length === 0 ? (
                    <p className="text-muted-foreground py-8 text-center text-sm">
                      {t('noCustomFields')}
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {customFields.map((field) => (
                        <div key={field.id} className="space-y-1.5">
                          <Label className="text-muted-foreground text-xs capitalize">
                            {field.field_name}
                          </Label>
                          <Input
                            value={customValues[field.id] ?? ''}
                            onChange={(e) =>
                              setCustomValues((prev) => ({
                                ...prev,
                                [field.id]: e.target.value,
                              }))
                            }
                            placeholder={t('enterCustomField', {
                              name: field.field_name,
                            })}
                            className="bg-muted border-border text-foreground placeholder:text-muted-foreground h-8 text-sm"
                          />
                        </div>
                      ))}
                      <Button
                        onClick={saveCustomFields}
                        disabled={savingCustom}
                        className="bg-primary hover:bg-primary/90 text-primary-foreground w-full"
                        size="sm"
                      >
                        {savingCustom ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Save className="size-3.5" />
                        )}
                        {t('saveCustomFieldsBtn')}
                      </Button>
                    </div>
                  )}
                </TabsContent>

                {/* Deals Tab */}
                <TabsContent
                  value="deals"
                  className="flex-1 overflow-y-auto px-4 py-3"
                >
                  {loadingDeals ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="text-primary size-5 animate-spin" />
                    </div>
                  ) : deals.length === 0 ? (
                    <p className="text-muted-foreground text-xs">
                      {t('dealsTab.noDeals')}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {deals.map((deal) => (
                        <div
                          key={deal.id}
                          className="border-border bg-muted/50 rounded-lg border p-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-foreground text-sm font-medium">
                              {deal.title}
                            </p>
                            {deal.stage && (
                              <span
                                className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                                style={{
                                  backgroundColor: `${deal.stage.color}20`,
                                  color: deal.stage.color,
                                }}
                              >
                                {deal.stage.name}
                              </span>
                            )}
                          </div>
                          <div className="text-muted-foreground mt-1.5 flex items-center justify-between text-xs">
                            <span className="flex items-center gap-1">
                              <DollarSign className="size-3" />
                              {formatCurrency(
                                deal.value ?? 0,
                                deal.currency || defaultCurrency
                              )}
                            </span>
                            {deal.status && deal.status !== 'open' && (
                              <span
                                className={
                                  deal.status === 'won'
                                    ? 'text-primary'
                                    : 'text-red-400'
                                }
                              >
                                {deal.status}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* Tasks Tab */}
                <TabsContent
                  value="tasks"
                  className="flex-1 overflow-y-auto px-4 py-3"
                >
                  {loadingTasks ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="text-primary size-5 animate-spin" />
                    </div>
                  ) : tasks.length === 0 ? (
                    <p className="text-muted-foreground text-xs">
                      No tasks found.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {tasks.map((task) => (
                        <div
                          key={task.id}
                          className="border-border bg-muted/50 rounded-lg border p-3"
                        >
                          <p className="text-foreground text-sm font-medium">
                            {task.title}
                          </p>
                          <p className="text-muted-foreground text-xs">
                            {task.description}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* Conversations Tab */}
                <TabsContent
                  value="conversations"
                  className="flex-1 overflow-y-auto px-4 py-3"
                >
                  {loadingConversations ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="text-primary size-5 animate-spin" />
                    </div>
                  ) : conversations.length === 0 ? (
                    <p className="text-muted-foreground text-xs">
                      No conversations found.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {conversations.map((conv) => (
                        <div
                          key={conv.id}
                          className="border-border bg-muted/50 rounded-lg border p-3"
                        >
                          <p className="text-foreground text-sm font-medium">
                            Conversation #{conv.id.substring(0, 8)}
                          </p>
                          <p className="text-muted-foreground text-xs">
                            {new Date(
                              conv.updated_at || conv.created_at
                            ).toLocaleString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* Calls Tab */}
                <TabsContent
                  value="calls"
                  className="flex-1 overflow-y-auto px-4 py-3"
                >
                  {loadingCalls ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="text-primary size-5 animate-spin" />
                    </div>
                  ) : calls.length === 0 ? (
                    <p className="text-muted-foreground text-xs">
                      No calls found.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {calls.map((call) => (
                        <div
                          key={call.id}
                          className="border-border bg-muted/50 rounded-lg border p-3"
                        >
                          <p className="text-foreground text-sm font-medium capitalize">
                            {call.direction} Call
                          </p>
                          <p className="text-muted-foreground text-xs">
                            {call.status} -{' '}
                            {new Date(call.createdAt).toLocaleString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          )}
        </SheetContent>
      </Sheet>
      <TemplatePicker
        open={templatePickerOpen}
        onOpenChange={setTemplatePickerOpen}
        onSelect={handleSendTemplate}
      />
    </>
  );
}
