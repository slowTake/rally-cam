// Module-level holder for the recorded video Blob.
// Avoids serializing a Blob through router state.

type RecordingState = {
  blob: Blob | null;
  url: string | null;
};

const state: RecordingState = {
  blob: null,
  url: null,
};

export function setRecording(blob: Blob): string {
  clearRecording();
  state.blob = blob;
  state.url = URL.createObjectURL(blob);
  return state.url;
}

export function getRecording(): RecordingState {
  return { blob: state.blob, url: state.url };
}

export function clearRecording(): void {
  if (state.url) {
    try {
      URL.revokeObjectURL(state.url);
    } catch {
      // ignore
    }
  }
  state.blob = null;
  state.url = null;
}
