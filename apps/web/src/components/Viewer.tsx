import { useEffect, useRef } from 'react';
import type { DesignModel } from '../types';
import { HouseScene, type ViewOptions } from '../viewer/HouseScene';

interface Props {
  model: DesignModel | null;
  options: ViewOptions;
  selectedRoomId: string | null;
  onSelect: (roomId: string | null) => void;
  onReady?: (scene: HouseScene) => void;
}

export default function Viewer({ model, options, selectedRoomId, onSelect, onReady }: Props): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HouseScene | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const scene = new HouseScene(containerRef.current);
    sceneRef.current = scene;
    onReady?.(scene);
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (sceneRef.current) sceneRef.current.onSelect = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!sceneRef.current) return;
    sceneRef.current.setModel(model);
    sceneRef.current.setOptions(options);
    sceneRef.current.setSelected(selectedRoomId);
  }, [model, options, selectedRoomId]);

  return <div className="viewer" ref={containerRef} aria-label="Visor 3D de la vivienda" />;
}
