'use client';

import { useEffect } from 'react';
import {
  getProjects,
  ensureInbox,
  addCapture,
  findCaptureByUrl,
} from '@/lib/db';

/**
 * Extension Bridge Page
 *
 * This invisible page is embedded as a hidden iframe inside the Chrome extension's popup.
 * It runs on the app's origin, giving it access to IndexedDB.
 * Communication happens via postMessage with the extension popup.
 *
 * Protocol:
 * - Bridge sends BRIDGE_READY on mount (unsolicited)
 * - Popup sends requests with { type, requestId, payload }
 * - Bridge responds with { type, requestId, payload }
 */

function isAllowedOrigin(origin: string): boolean {
  return (
    origin.startsWith('chrome-extension://') ||
    origin.startsWith('http://localhost') ||
    origin.startsWith('http://127.0.0.1')
  );
}

export default function ExtensionBridgePage() {
  useEffect(() => {
    let mounted = true;

    async function initialize() {
      // Ensure Unsorted exists
      try {
        await ensureInbox();
      } catch (e) {
        console.error('[Bridge] ensureInbox failed:', e);
      }

      if (!mounted) return;

      // Signal ready to parent
      if (window.parent !== window) {
        window.parent.postMessage({ type: 'BRIDGE_READY' }, '*');
      }
    }

    async function handleMessage(event: MessageEvent) {
      // Security: only accept messages from allowed origins
      if (!isAllowedOrigin(event.origin)) return;

      const { type, requestId, payload } = event.data || {};
      if (!type || !requestId) return;

      try {
        switch (type) {
          case 'BRIDGE_PING': {
            respond(event, requestId, 'BRIDGE_PONG', {});
            break;
          }

          case 'GET_PROJECTS': {
            const projects = await getProjects();
            respond(event, requestId, 'PROJECTS_RESULT', { projects });
            break;
          }

          case 'CHECK_DUPLICATE': {
            const url = payload?.url;
            if (!url) {
              respond(event, requestId, 'DUPLICATE_RESULT', { found: false });
              break;
            }
            const result = await findCaptureByUrl(url);
            if (result) {
              respond(event, requestId, 'DUPLICATE_RESULT', {
                found: true,
                projectName: result.project.name,
              });
            } else {
              respond(event, requestId, 'DUPLICATE_RESULT', { found: false });
            }
            break;
          }

          case 'ADD_CAPTURE': {
            const {
              projectId,
              url,
              title,
              body,
              author,
              images,
              metadata,
              note,
            } = payload || {};

            if (!projectId || !url) {
              respond(event, requestId, 'CAPTURE_RESULT', {
                success: false,
                error: 'Missing projectId or url',
              });
              break;
            }

            const capture = await addCapture(
              projectId,
              url,
              title || url,
              body || '',
              author || '',
              images || [],
              metadata || {},
              note || '',
            );

            respond(event, requestId, 'CAPTURE_RESULT', {
              success: true,
              captureId: capture.id,
            });
            break;
          }

          default:
            console.warn('[Bridge] Unknown message type:', type);
        }
      } catch (e) {
        console.error('[Bridge] Error handling message:', type, e);
        respond(event, requestId, 'ERROR', {
          error: e instanceof Error ? e.message : 'Unknown error',
        });
      }
    }

    function respond(
      event: MessageEvent,
      requestId: string,
      type: string,
      payload: Record<string, unknown>,
    ) {
      if (event.source) {
        (event.source as Window).postMessage(
          { type, requestId, payload },
          event.origin,
        );
      }
    }

    window.addEventListener('message', handleMessage);
    initialize();

    return () => {
      mounted = false;
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  // Render nothing — this is an invisible bridge page
  return <div />;
}
