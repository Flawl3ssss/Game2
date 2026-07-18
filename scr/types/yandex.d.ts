declare global {
  interface YaGamesSDK {
    environment?: { i18n?: { lang?: string } };
    features?: {
      LoadingAPI?: { ready: () => void };
      GameplayAPI?: { start: () => void; stop: () => void };
    };
    adv?: {
      showRewardedVideo: (options: {
        callbacks: {
          onOpen?: () => void;
          onRewarded?: () => void;
          onClose?: () => void;
          onError?: (error: unknown) => void;
        };
      }) => void;
    };
    getPlayer?: () => Promise<YaPlayer>;
    on?: (event: string, callback: () => void) => void;
    off?: (event: string, callback: () => void) => void;
  }

  interface YaPlayer {
    getData: (keys?: string[]) => Promise<Record<string, unknown>>;
    setData: (data: Record<string, unknown>, flush?: boolean) => Promise<void>;
  }

  interface YaGamesGlobal {
    init: () => Promise<YaGamesSDK>;
  }

  interface Window {
    YaGames?: YaGamesGlobal;
  }
}

export {};
