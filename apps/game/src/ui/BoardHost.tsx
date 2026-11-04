import Phaser from "phaser";
import { useEffect, useRef } from "preact/hooks";
import { BoardScene, type BoardDeps } from "../render/BoardScene";

/** Monte un jeu Phaser par partie. La taille interne suit la largeur du conteneur × densité de pixels (max 2). */
export function BoardHost(props: Omit<BoardDeps, "cellPx"> & { onScene: (s: BoardScene | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current!;
    const { width, height } = props.session.state;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cellPx = Math.max(24, Math.floor((el.clientWidth / width) * dpr));
    const scene = new BoardScene();
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: el,
      width: width * cellPx,
      height: height * cellPx,
      transparent: true,
      scene: [],
      banner: false,
      fps: { target: 60 },
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      render: { antialias: true, powerPreference: "low-power" },
      audio: { noAudio: true },
    });
    game.scene.add("board", scene, true, { ...props, cellPx } satisfies BoardDeps);
    props.onScene(scene);
    return () => {
      props.onScene(null);
      game.destroy(true);
    };
  }, [props.session]);
  const { width, height } = props.session.state;
  return <div class="board-host" ref={ref} style={{ aspectRatio: `${width} / ${height}`, "--aspect": String(width / height) }} data-testid="board" />;
}
