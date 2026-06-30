(() => {
  const b = window.app?.curRoom?.battle;
  if (!b) {
    console.warn('No battle in current room. Open a battle or a replay, then re-run.');
    return;
  }

  const snapPokemon = (p) => p && ({
    speciesForme: p.speciesForme,
    name: p.name,
    level: p.level,
    gender: p.gender,
    hp: p.hp,
    maxhp: p.maxhp,
    hpPercent: p.maxhp ? Math.round((p.hp / p.maxhp) * 100) : null,
    fainted: p.fainted,
    status: p.status,
    statusStage: p.statusStage,
    boosts: p.boosts,
    item: p.item,
    prevItem: p.prevItem,
    ability: p.ability,
    baseAbility: p.baseAbility,
    teraType: p.teraType,
    terastallized: p.terastallized,
    moveTrack: p.moveTrack, // [[moveName, ppUsed], ...] of revealed moves
    volatiles: p.volatiles && Object.keys(p.volatiles),
    _keys: Object.keys(p),
  });

  const snapSide = (s) => s && ({
    name: s.name,
    totalPokemon: s.totalPokemon,
    sideConditions: s.sideConditions && Object.keys(s.sideConditions),
    active: (s.active || []).map(snapPokemon),
    team: (s.pokemon || []).map((p) => p.speciesForme),
    _keys: Object.keys(s),
  });

  const snap = {
    gen: b.gen,
    gameType: b.gameType,
    turn: b.turn,
    weather: b.weather,
    pseudoWeather: b.pseudoWeather, // terrain/trick-room/etc usually live here
    sidesCount: b.sides?.length,
    mySide: snapSide(b.mySide),
    farSide: snapSide(b.farSide),
    _battleKeys: Object.keys(b),
  };

  window.__battleSnap = snap;
  window.__rawFarActive0 = b.farSide?.active?.[0]; // raw object for poking at
  console.log('%cBATTLE SNAPSHOT (also at window.__battleSnap)', 'font-weight:bold');
  console.log(JSON.stringify(snap, null, 2));
  return snap;
})();
