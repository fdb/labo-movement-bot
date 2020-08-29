const WebSocket = require("ws");
const { Client } = require("node-osc");

const ws = new WebSocket(
  "wss://relaxed-werewolf.reticulum.io/socket/websocket?vsn=2.0.0"
);

const STATE_STARTING = "starting";
const STATE_JOINING = "joining";
const STATE_CONNECTED = "connected";

let state = STATE_STARTING;
let hubId = "T8NTTNr";
let fullHubId = `hub:${hubId}`;
let receiveId = 1;
let sendId = 1;
let botSessionId;
let vapidPublicKey;
let avatarId = "8DugdXZ";
let displayName = "MrAlienRobot";
// Members keyed by session ID.
let members = {};

const oscClient = new Client("127.0.0.1", 3333);

function sendMessage(roomId, command, body) {
  const message = JSON.stringify([receiveId, sendId, roomId, command, body]);
  ws.send(message);
  sendId++;
}

function receiveMessage(data) {
  const [n1, n2, channel, command, body] = JSON.parse(data);
  if (Number.isInteger(n1)) {
    receiveId = n1;
  }
  if (command === "phx_reply" && state === STATE_STARTING) {
    if (body.status === "ok") {
      console.log("Joining Hubs...");
      state = STATE_JOINING;
      botSessionId = body.response.session_id;
      vapidPublicKey = body.response.vapid_public_key;
      sendMessage(fullHubId, "phx_join", {
        profile: { avatarId, displayName },
        auth_token: null,
        perms_token: null,
        context: { mobile: false, embed: false },
      });
    } else {
      console.log(`ERROR WHILE STARTING: ${JSON.stringify(body)}`);
    }
  } else if (command === "phx_reply" && state == STATE_JOINING) {
    if (body.status === "ok") {
      const hub = body.response.hubs[0];
      console.log(`Connected to ${hub.name}.`);
      state = STATE_CONNECTED;
      setInterval(sendHeartbeat, 30000);
    } else {
      console.log(`ERROR WHILE JOINING: ${JSON.stringify(body)}`);
    }
  } else if (command === "presence_diff") {
    for (const sessionId of Object.keys(body.joins)) {
      const meta = body.joins[sessionId].metas[0];
      if (meta.presence !== 'room') continue;
      const displayName = meta.profile.displayName;
      // if (displayName === 'MrsRobot') continue;
      // if (displayName === 'MrAlienRobot') continue;
      console.log(`${displayName} joined.`);
      members[sessionId] = {
        displayName,
        distance: 0,
      };
    }
    for (const sessionId of Object.keys(body.leaves)) {
      const meta = body.leaves[sessionId].metas[0];
      if (meta.presence !== 'room') continue;
      const displayName = meta.profile.displayName;
      console.log(`${displayName} left.`);
      delete members[sessionId];
    }
  } else if (command === "presence_state") {
    for (const sessionId of Object.keys(body)) {
      members[sessionId] = {
        displayName: body[sessionId].metas[0].profile.displayName,
        distance: 0,
      };
    }
  } else if (command === "nafr" && state === STATE_CONNECTED) {
    const naf = JSON.parse(body.naf);
    try {
      const owner = naf.data.d[0].owner;
      const position = naf.data.d[0].components[0];

      if (position) {
        const dist = Math.sqrt(
          position.x * position.x +
          position.y * position.y +
          position.z * position.z
        );
        if (members[owner]) {
          members[owner].distance = dist;
          sendDistances();
        }
        // oscClient.send("/move", owner, dist);
      }
    } catch (e) {
      // Ignore the exception!
    }
  } else if (command === "message" && state === STATE_CONNECTED) {
    // console.log(body);
    // handleChatMessage(body);
  } else if (command === "presence_diff") {
    console.log(body);
  } else {
    //console.log(`Unknown command ${command}`);
  }
}

function sendDistances() {
  console.log(members);
  let sessionIds = Object.keys(members).sort();
  sessionIds = sessionIds.filter((id) => id !== botSessionId);
  const distances = sessionIds.map((id) => members[id].distance);
  oscClient.send("/move", ...distances);
}

function sendHeartbeat() {
  sendMessage("phoenix", "heartbeat", {});
}

ws.on("open", function () {
  sendMessage("ret", "phx_join", { hub_id: hubId });
});
ws.on("message", receiveMessage);
ws.on("error", (data) => console.error('Server error: ${data}'));
ws.on("close", () => console.error('Connection closed.'));