'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { format } from 'date-fns';
import { CheckCircle2, Circle, Calendar, MessageSquare, Briefcase, RefreshCw, XCircle, Phone, MessageCircle, StickyNote, Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

// Re-defining interface to match new timeline unified endpoint
interface TimelineItem {
  id: string;
  type: string;
  occurred_at: string;
  title: string;
  status: string;
  actor: string;
  metadata: any;
}

interface ActivityTimelineProps {
  contactId?: string | null;
  dealId?: string | null;
  companyId?: string | null;
  refreshTrigger?: number;
}

export function ActivityTimeline({ contactId, dealId, companyId, refreshTrigger }: ActivityTimelineProps) {
  const [activities, setActivities] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const t = useTranslations('Activities'); // Fallback if missing

  useEffect(() => {
    async function fetchActivities() {
      if (!contactId && !dealId && !companyId) return;

      setLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams();
        if (contactId) query.append('contactId', contactId);
        if (dealId) query.append('dealId', dealId);
        if (companyId) query.append('companyId', companyId);

        const res = await fetch(`/api/zenith/timeline?${query.toString()}`);
        if (!res.ok) throw new Error('Failed to fetch timeline');

        const data = await res.json();
        setActivities(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchActivities();
  }, [contactId, dealId, companyId, refreshTrigger]);

  if (!contactId && !dealId && !companyId) return null;

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-4 animate-pulse">
            <div className="h-8 w-8 rounded-full bg-muted" />
            <div className="space-y-2 flex-1">
              <div className="h-4 w-1/3 bg-muted rounded" />
              <div className="h-3 w-1/4 bg-muted rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return <div className="text-sm text-red-500">Error loading timeline: {error}</div>;
  }

  if (activities.length === 0) {
    return <div className="text-sm text-muted-foreground text-center py-4">No activities yet.</div>;
  }

  const renderIcon = (type: string, title?: string) => {
    if (type === 'message') return <MessageCircle className="h-4 w-4 text-green-500" />;
    if (type === 'call') return <Phone className="h-4 w-4 text-blue-500" />;
    if (type === 'task') return <CheckCircle2 className="h-4 w-4 text-orange-500" />;
    if (type === 'appointment') return <Clock className="h-4 w-4 text-purple-500" />;
    if (type === 'note') return <StickyNote className="h-4 w-4 text-yellow-500" />;
    if (type === 'activity') {
      const actType = title || '';
      switch (actType) {
        case 'task_created': return <Calendar className="h-4 w-4 text-blue-500" />;
        case 'task_completed': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
        case 'task_reopened': return <RefreshCw className="h-4 w-4 text-orange-500" />;
        case 'task_cancelled': return <XCircle className="h-4 w-4 text-gray-500" />;
        case 'note_created': return <MessageSquare className="h-4 w-4 text-purple-500" />;
        case 'deal_created': return <Briefcase className="h-4 w-4 text-indigo-500" />;
        case 'deal_stage_changed': return <RefreshCw className="h-4 w-4 text-blue-500" />;
        case 'deal_won': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
        case 'deal_lost': return <XCircle className="h-4 w-4 text-red-500" />;
        case 'deal_reopened': return <RefreshCw className="h-4 w-4 text-orange-500" />;
        default: return <Circle className="h-4 w-4 text-gray-500" />;
      }
    }
    return <Circle className="h-4 w-4 text-gray-500" />;
  };

  const renderContent = (activity: TimelineItem) => {
    const meta = activity.metadata || {};

    if (activity.type === 'message') {
      return <span>Mensagem: <strong>{activity.title || meta.contentType}</strong></span>;
    }
    if (activity.type === 'call') {
      return <span>Chamada ({activity.title}): <strong>{meta.from || '?'} &rarr; {meta.to || '?'}</strong></span>;
    }
    if (activity.type === 'note') {
      return <span>Nota: <strong>{activity.title}</strong></span>;
    }
    if (activity.type === 'task') {
      return <span>Tarefa: <strong>{activity.title}</strong></span>;
    }
    if (activity.type === 'appointment') {
      return <span>Compromisso: <strong>{activity.title}</strong></span>;
    }

    if (activity.type === 'activity') {
      const actType = activity.title; // title holds the activity type string here
      switch (actType) {
        case 'task_created':
          return <span>Created task <strong>{meta.title}</strong></span>;
        case 'task_completed':
          return <span>Completed task <strong>{meta.title}</strong></span>;
        case 'task_reopened':
          return <span>Reopened task <strong>{meta.title}</strong></span>;
        case 'task_cancelled':
          return <span>Cancelled task <strong>{meta.title}</strong></span>;
        case 'note_created':
          return <span>Added a note</span>;
        case 'deal_created':
          return <span>Created deal <strong>{meta.title}</strong></span>;
        case 'deal_stage_changed':
          return <span>Moved deal <strong>{meta.title}</strong> to a new stage</span>;
        case 'deal_won':
          return <span>Won deal <strong>{meta.title}</strong></span>;
        case 'deal_lost':
          return <span>Lost deal <strong>{meta.title}</strong></span>;
        case 'deal_reopened':
          return <span>Reopened deal <strong>{meta.title}</strong></span>;
        default:
          return <span>{actType}</span>;
      }
    }
    
    return <span>{activity.type}</span>;
  };

  return (
    <div className="relative space-y-6 before:absolute before:inset-0 before:ml-4 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-border">
      {activities.map((activity) => (
        <div key={activity.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
          {/* Icon */}
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-background border shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
            {renderIcon(activity.type, activity.title)}
          </div>

          <Card className="w-[calc(100%-3rem)] md:w-[calc(50%-2rem)] shadow-sm">
            <CardContent className="p-3 text-sm">
              <div className="flex justify-between items-start gap-2 mb-1">
                <div className="text-muted-foreground">{renderContent(activity)}</div>
              </div>
              <time className="text-xs text-muted-foreground font-medium">
                {format(new Date(activity.occurred_at), 'MMM d, h:mm a')}
              </time>
            </CardContent>
          </Card>
        </div>
      ))}
    </div>
  );
}
