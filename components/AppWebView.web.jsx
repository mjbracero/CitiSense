import {
  createElement,
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { StyleSheet, View } from "react-native";

// ===== [WEB VIEW] iframe stand-in for react-native-webview on web =====
// Supports the subset the app uses: source.html, onMessage, onLoadEnd,
// pointerEvents, and ref.injectJavaScript.
function buildBridgeScript(channelId) {
  return `<script>window.ReactNativeWebView={postMessage:function(d){parent.postMessage({__appWebView:${JSON.stringify(
    channelId
  )},data:String(d)},"*");}};</script>`;
}

function withBridge(html, channelId, baseUrl) {
  const head =
    (baseUrl ? `<base href="${baseUrl}">` : "") + buildBridgeScript(channelId);
  const source = String(html || "");
  if (/<head[^>]*>/i.test(source)) {
    return source.replace(/<head[^>]*>/i, (match) => `${match}${head}`);
  }
  return `${head}${source}`;
}

const AppWebView = forwardRef(function AppWebView(
  { source, style, onMessage, onLoadEnd, pointerEvents },
  ref
) {
  const iframeRef = useRef(null);
  const channelId = useId();
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const srcDoc = useMemo(
    () => withBridge(source?.html, channelId, source?.baseUrl),
    [source?.html, source?.baseUrl, channelId]
  );

  useImperativeHandle(ref, () => ({
    injectJavaScript: (code) => {
      try {
        iframeRef.current?.contentWindow?.eval(String(code));
      } catch {
        // Frame not ready yet or script error inside the page.
      }
    },
    reload: () => {
      const frame = iframeRef.current;
      if (frame) frame.srcdoc = srcDoc;
    },
  }));

  useEffect(() => {
    const handleMessage = (event) => {
      if (event?.data?.__appWebView !== channelId) return;
      onMessageRef.current?.({ nativeEvent: { data: event.data.data } });
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [channelId]);

  return (
    <View style={[styles.container, style]} pointerEvents={pointerEvents}>
      {createElement("iframe", {
        ref: iframeRef,
        srcDoc,
        title: "embedded-content",
        onLoad: () => onLoadEnd?.({ nativeEvent: {} }),
        style: {
          border: 0,
          width: "100%",
          height: "100%",
          display: "block",
          pointerEvents: pointerEvents === "none" ? "none" : "auto",
        },
        allow: "geolocation",
      })}
    </View>
  );
});

export default AppWebView;

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
  },
});
