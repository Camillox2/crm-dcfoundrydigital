export type ChatMessage = {
  id: string;
  body: string;
  message_type: string;
  direction: string;
  actor_type: string;
  delivery: string;
  sent_at: string;
  has_media: boolean;
  file_name: string | null;
  mime_type: string | null;
  historical: boolean;
  delivery_error?: string | null;
};

export type ConversationRow = {
  id: string;
  conversation_id?: string;
  name?: string;
  company?: string;
  phone?: string;
  photoUrl: string | null;
  last_message: string | null;
  last_at: string | null;
  ai_enabled?: boolean;
  status?: 'open' | 'closed';
  unread_count?: number;
  last_direction?: string | null;
  last_actor_type?: string | null;
  last_message_type?: string | null;
  last_inbound_at?: string | null;
  pending_since?: string | null;
  sla_goal_minutes?: number;
  created_at?: string;
  campaign?: string;
  scope_summary?: string;
  source?: string;
};

export type LiveFrame = {
  type: 'changed';
  event?: 'message:new' | 'message:updated' | 'conversation:updated';
  leadId?: string;
  messageId?: string;
};
