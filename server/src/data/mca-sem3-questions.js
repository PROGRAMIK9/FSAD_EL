/**
 * Sample question bank for the MCA 3rd-semester theory courses: five 1-mark
 * questions per unit, written from the unit topics in mca-sem3.js.
 *
 * mcq(text, options, correctIndex, explanation, difficulty)
 * fill(text, answer, explanation, difficulty): answer is matched ignoring case
 * and outer spaces, so every fill-in has a single unambiguous spelling.
 */
const mcq = (text, options, correct, explanation, difficulty = 'medium') => ({ type: 'single', text, options, correct, explanation, difficulty });
const fill = (text, answer, explanation, difficulty = 'easy') => ({ type: 'fill_blank', text, answer, explanation, difficulty });

export const QUESTIONS = {
  MCA261IA: {
    1: [
      mcq('In the MVC pattern, which component handles user input and coordinates the model and the view?', ['Model', 'View', 'Controller', 'Router'], 2, 'The controller receives input, updates the model and selects the view to render.', 'easy'),
      mcq('Node.js handles many concurrent connections efficiently mainly because it uses:', ['A new thread for every request', 'An event-driven, non-blocking I/O model', 'One process per CPU core by default', 'Synchronous file I/O'], 1, 'A single-threaded event loop with non-blocking I/O lets Node.js serve many connections without a thread per request.'),
      mcq('Which function loads a module in the CommonJS module system used by Node.js?', ['import()', 'require()', 'include()', 'load()'], 1, 'CommonJS modules are loaded with require() and exported with module.exports.', 'easy'),
      mcq('Which Express method mounts middleware so that it runs for all routes?', ['app.use()', 'app.listen()', 'app.set()', 'app.engine()'], 0, 'app.use() mounts middleware on a path (all paths by default).'),
      fill('The Node.js core module used to create an HTTP server is named ____.', 'http', 'http.createServer() comes from the built-in http module.'),
    ],
    2: [
      mcq('JSX must be compiled to plain JavaScript before browsers can run it. Which tool is commonly used for this?', ['Babel', 'ESLint', 'Nodemon', 'npm audit'], 0, 'Babel transforms JSX into React.createElement / jsx() calls.', 'easy'),
      mcq('Data passed from a parent component to a child component is received by the child through:', ['state', 'props', 'refs', 'keys'], 1, 'Props are read-only inputs passed from parent to child.', 'easy'),
      mcq('In a React class component, state should be updated with:', ['this.state = newState', 'this.setState()', 'this.props.update()', 'this.render()'], 1, 'setState() schedules an update and re-render; assigning this.state directly does not.'),
      mcq('How does a child component usually tell its parent that something changed?', ['By modifying its props directly', 'By calling a callback function passed down via props', "By editing the parent's state object", 'By re-mounting the parent'], 1, 'The parent passes a handler as a prop and the child calls it, keeping state in the parent.'),
      fill("Elements placed between a component's opening and closing tags are available inside it as props.____", 'children', 'props.children holds the nested elements, enabling composition.'),
    ],
    3: [
      mcq('MongoDB stores data as:', ['Rows in fixed-schema tables', 'BSON documents grouped in collections', 'XML files', 'Key-value pairs only'], 1, 'MongoDB is a document database that stores BSON documents in collections.', 'easy'),
      mcq('Distributing a MongoDB collection across several machines for horizontal scaling is called:', ['Replication', 'Sharding', 'Indexing', 'Journaling'], 1, 'Sharding partitions data across shards; replication copies the same data for availability.'),
      mcq('Which Mongoose model method returns a single document that matches a query?', ['find()', 'findOne()', 'findMany()', 'aggregate()'], 1, 'findOne() resolves to one document (or null); find() returns an array.', 'easy'),
      mcq('In a Mongoose schema, which option supplies a value when none is provided?', ['required', 'default', 'unique', 'index'], 1, 'The default option sets a value at document creation when the field is missing.'),
      fill("A Mongoose schema is compiled into a model with mongoose.____('User', userSchema).", 'model', 'mongoose.model(name, schema) registers and returns the model.'),
    ],
    4: [
      mcq('In a REST API, which HTTP method is conventionally used to create a new resource in a collection?', ['GET', 'POST', 'PUT', 'DELETE'], 1, 'POST to a collection URL creates a new member resource.', 'easy'),
      mcq('Which built-in Express middleware parses JSON request bodies?', ['express.json()', 'express.static()', 'express.Router()', 'express.query()'], 0, 'express.json() parses application/json bodies into req.body.'),
      mcq('In an Express handler for the route "/api/issues/:id", the value of :id is read from:', ['req.query', 'req.params', 'req.body', 'req.cookies'], 1, 'Named route segments are available on req.params.'),
      mcq('Express recognises a middleware function as an error handler because it:', ['Has four arguments (err, req, res, next)', 'Is named errorHandler', 'Contains a try/catch block', 'Is registered with app.error()'], 0, 'Error-handling middleware is defined with exactly four parameters.', 'hard'),
      fill('The HTTP status code returned when a resource has been created successfully is ____.', '201', '201 Created is the standard response to a successful create.'),
    ],
    5: [
      mcq('In React Router v6, the value of a dynamic segment such as /issues/:id is read with:', ['useParams()', 'useState()', 'useEffect()', 'useRef()'], 0, 'useParams() returns an object of the current route parameters.', 'easy'),
      mcq('Programmatic navigation in React Router v6 is done with:', ['useNavigate()', 'window.redirect()', 'useLocation() only', 'useHistory()'], 0, 'useNavigate() returns a function that changes the location; useHistory() was removed in v6.'),
      mcq('In the URL /issues?status=New, the part status=New is the:', ['Route parameter', 'Query string', 'Hash fragment', 'Path prefix'], 1, 'Everything after ? is the query string, read with useSearchParams() in v6.', 'easy'),
      mcq('In a controlled form input in React, the input value comes from:', ['The DOM node only', 'Component state', 'A global variable', 'The browser history'], 1, 'A controlled input takes its value from state and updates it through onChange.'),
      fill("React Router v6 renders a nested child route inside the parent's layout through the ____ component.", 'Outlet', '<Outlet /> marks where child routes render.', 'medium'),
    ],
  },

  MCA262IA: {
    1: [
      mcq('The main goal of DevOps is to:', ['Keep development and operations strictly separate', 'Shorten delivery cycles through collaboration and automation', 'Replace testing with manual sign-off', 'Avoid version control'], 1, 'DevOps combines culture and automation to deliver changes quickly and reliably.', 'easy'),
      mcq('The background service on a host that builds, runs and manages containers is the:', ['Docker client', 'Docker daemon', 'Docker Hub', 'Dockerfile'], 1, 'The client sends commands to the Docker daemon (dockerd), which does the work.'),
      mcq('Docker Hub is an example of a:', ['Container runtime', 'Docker registry', 'Container orchestrator', 'Build cache'], 1, 'Registries store and distribute images; Docker Hub is the public default.', 'easy'),
      mcq('Compared with virtual machines, containers:', ['Each include a full guest operating system', 'Share the host operating system kernel', 'Always require a hypervisor', 'Cannot run on Linux'], 1, 'Containers isolate processes but share the host kernel, so they are lighter than VMs.'),
      fill('The text file with the instructions used to build a Docker image is called a ____.', 'Dockerfile', 'docker build reads a Dockerfile to produce an image.'),
    ],
    2: [
      mcq('Which command builds an image named myapp from the Dockerfile in the current directory?', ['docker build -t myapp .', 'docker run myapp', 'docker pull myapp', 'docker commit myapp .'], 0, 'docker build with -t tags the image; the final . is the build context.', 'easy'),
      mcq('docker commit is used to:', ['Push an image to a registry', "Save a container's current state as a new image", 'Delete stopped containers', 'Show container logs'], 1, 'Committing a container captures its filesystem changes as a new image, a way to save your work.'),
      mcq('Instructions such as RUN and COPY in a Dockerfile each add a new image:', ['Layer', 'Container', 'Volume', 'Network'], 0, 'Images are stacks of read-only layers, which also enables build caching.'),
      mcq('Which docker run flag starts a container in the background (detached)?', ['-d', '-it', '-p', '-v'], 0, '-d detaches; -p publishes ports and -v mounts volumes.', 'easy'),
      fill('The docker ____ command lists the running containers.', 'ps', 'docker ps lists running containers; add -a for all.'),
    ],
    3: [
      mcq('Continuous Integration means:', ['Merging code often and automatically building and testing every change', 'Deploying to production once a year', 'Testing each release manually', 'Working without version control'], 0, 'CI integrates small changes frequently with automated builds and tests.', 'easy'),
      mcq('Running the Jenkins master inside a Docker container mainly gives:', ['A reproducible, portable CI server environment', 'Faster processors', 'Automatic code review', 'A replacement for Git'], 0, 'Containerising Jenkins makes the CI server easy to recreate and move.'),
      mcq('Docker Hub automated builds create a new image when:', ['Code is pushed to the linked source repository', 'A container crashes', 'The host restarts', 'A user logs in to Docker Hub'], 0, 'Automated builds watch a linked repository and build on each push.'),
      mcq('The recommended way to run the same image in development, test and production is to:', ['Supply environment-specific configuration (such as environment variables) at run time', 'Hand-edit files inside running containers', 'Rebuild the image differently for each environment', 'Bake secrets into the image'], 0, 'One immutable image plus per-environment configuration keeps deployments consistent.'),
      fill('Jenkins is an open-source automation server widely used for continuous ____.', 'integration', 'Jenkins orchestrates CI (and CD) pipelines.'),
    ],
    4: [
      mcq('Minikube is used to:', ['Run a single-node Kubernetes cluster locally', 'Build Docker images', 'Host a container registry', 'Monitor Jenkins jobs'], 0, 'Minikube starts a local single-node cluster for learning and development.', 'easy'),
      mcq('The command-line tool for interacting with a Kubernetes cluster is:', ['kubectl', 'dockerctl', 'kubelet-cli', 'minictl'], 0, 'kubectl talks to the Kubernetes API server.', 'easy'),
      mcq('Which command lists the nodes in a Kubernetes cluster?', ['kubectl get nodes', 'kubectl run nodes', 'kubectl logs nodes', 'kubectl apply nodes'], 0, 'kubectl get nodes shows the cluster nodes and their status.'),
      mcq('To make a deployed application reachable from outside the cluster you typically create a:', ['Service', 'ConfigMap', 'Label', 'Secret'], 0, 'A Service (for example of type LoadBalancer or NodePort) exposes pods.'),
      fill('The web-based UI for viewing and managing a Kubernetes cluster is the Kubernetes ____.', 'dashboard', 'minikube dashboard opens the Kubernetes dashboard.'),
    ],
    5: [
      mcq('A Kubernetes pod is:', ['A group of one or more containers that share network and storage', 'A single virtual machine', 'A Docker image', 'A cluster node'], 0, 'Containers in a pod share an IP address and volumes and are scheduled together.', 'easy'),
      mcq('Pods are usually created declaratively from descriptors written in:', ['YAML or JSON', 'XML', 'CSV', 'INI'], 0, 'kubectl create -f / apply -f accept YAML or JSON manifests.', 'easy'),
      mcq('Labels on Kubernetes objects are used to:', ['Organise objects and select subsets of them', 'Encrypt pod traffic', 'Set CPU limits', 'Store secrets'], 0, 'Label selectors pick the objects a command or controller should act on.'),
      mcq('Which command lists only the pods labelled app=web?', ['kubectl get pods -l app=web', 'kubectl get pods --name web', 'kubectl describe app=web', 'kubectl logs -l app'], 0, '-l (or --selector) filters by label.'),
      fill('The kubectl command that removes a pod is kubectl ____ pod <name>.', 'delete', 'kubectl delete pod <name> stops and removes the pod.'),
    ],
  },

  MCA263D1: {
    1: [
      mcq('Which lightweight RESTful protocol for constrained IoT devices runs over UDP?', ['CoAP', 'AMQP', 'XMPP', 'FTP'], 0, 'CoAP (RFC 7252) offers REST-style requests over UDP for constrained nodes.'),
      mcq('In the three-layer IoT architecture, sensors and actuators belong to the:', ['Perception layer', 'Network layer', 'Application layer', 'Session layer'], 0, 'The perception layer senses and acts on the physical world.', 'easy'),
      mcq('LoRaWAN is best suited for:', ['Long-range, low-power, low-data-rate communication', 'High-bandwidth video streaming', 'Wired industrial fieldbus links', 'Short-range audio'], 0, 'LoRaWAN targets battery-powered devices sending small payloads over kilometres.'),
      mcq('Which synchronous, full-duplex serial interface uses a clock line, MOSI, MISO and chip-select?', ['SPI', 'UART', 'Modbus TCP', 'BLE'], 0, 'SPI is clocked and full-duplex; UART is asynchronous; I2C uses two wires.', 'hard'),
      fill('A virtual replica of a physical asset that is kept in sync with it using sensor data is called a digital ____.', 'twin', 'Digital twins mirror the state of physical objects for monitoring and simulation.'),
    ],
    2: [
      mcq('DTLS provides TLS-like security for:', ['UDP-based communication', 'Wired Ethernet only', 'File storage', 'Bluetooth pairing only'], 0, 'Datagram TLS secures datagram transports such as CoAP over UDP.'),
      mcq('OAuth2 is primarily a framework for:', ['Delegated authorization using access tokens', 'Encrypting firmware images', 'Compressing sensor data', 'Routing packets'], 0, 'OAuth2 issues scoped access tokens instead of sharing credentials.'),
      mcq('Secure boot ensures that:', ['Only firmware with a valid signature runs on the device', 'The device boots faster', 'Firmware is always stored in the cloud', 'Updates never need a reboot'], 0, 'Each boot stage verifies the signature of the next before running it.'),
      mcq('All the points where an attacker can try to enter or extract data from a system form its:', ['Attack surface', 'Threat model', 'Firewall', 'Payload'], 0, 'Reducing the attack surface (open ports, interfaces, services) improves security.', 'easy'),
      fill('The OWASP IoT project publishes a list of the top ____ IoT security risks.', '10', 'The OWASP IoT Top 10 lists the most critical IoT risks.'),
    ],
    3: [
      mcq('Running ML inference on the device instead of in the cloud mainly reduces:', ['Latency and bandwidth use', 'Model accuracy', 'The need for sensors', 'Power consumption to zero'], 0, 'Edge inference avoids round trips and sends only results upstream.', 'easy'),
      mcq('Which framework is designed to run ML models on mobile and microcontroller devices?', ['TensorFlow Lite', 'Apache Spark', 'Hadoop', 'Kubernetes'], 0, 'TensorFlow Lite (and TFLite Micro) targets mobile and embedded devices.', 'easy'),
      mcq('Predictive maintenance uses sensor data to:', ['Forecast equipment failure before it happens', 'Replace machines only on a fixed schedule', 'Increase sampling rates indefinitely', 'Disable alarms'], 0, 'Models detect degradation patterns so maintenance happens just in time.'),
      mcq('Which of these is an edge AI hardware platform?', ['NVIDIA Jetson', 'InfluxDB', 'Grafana', 'Node-RED'], 0, 'Jetson modules run GPU-accelerated inference at the edge; the others are software tools.'),
      fill('Detecting readings that deviate significantly from normal behaviour is called ____ detection.', 'anomaly', 'Anomaly detection flags unusual sensor patterns, often on-device.'),
    ],
    4: [
      mcq('InfluxDB and TimescaleDB are examples of:', ['Time-series databases', 'Graph databases', 'Message brokers', 'Key-value caches'], 0, 'They are optimised for timestamped measurements.', 'easy'),
      mcq('Node-RED is mainly used for:', ['Flow-based wiring of devices, APIs and services', 'Training deep neural networks', 'Writing microcontroller firmware in C', 'Hosting DNS'], 0, 'Node-RED builds ingestion and automation flows visually.'),
      mcq('Grafana is primarily a:', ['Visualization and dashboard tool', 'Relational database', 'IoT radio protocol', 'Microcontroller'], 0, 'Grafana queries data sources and renders dashboards and alerts.', 'easy'),
      mcq('Sending an alert when a temperature crosses a threshold is an example of:', ['An event trigger and notification', 'Data sharding', 'Firmware signing', 'Edge model training'], 0, 'Rules on incoming data raise events that notify users or systems.'),
      fill("Amazon's object storage service commonly used to archive IoT data is AWS ____.", 'S3', 'Amazon S3 (Simple Storage Service) stores objects durably.'),
    ],
    5: [
      mcq('OTA updates allow devices to:', ['Receive firmware updates over the network', 'Run without power', 'Skip authentication', 'Communicate only over cables'], 0, 'Over-the-air updates deliver new firmware remotely.', 'easy'),
      mcq('Packaging an IoT backend service with its dependencies for consistent deployment is done with:', ['Containers such as Docker', 'Spreadsheets', 'Serial terminals', 'Bootloaders'], 0, 'Containers make IoT services portable across edge and cloud.'),
      mcq('A key advantage of GraphQL over a typical REST endpoint is that clients can:', ['Request exactly the fields they need in one query', 'Avoid HTTP entirely', 'Work without a schema', 'Write directly to the database'], 0, 'GraphQL queries specify the shape of the response, avoiding over- and under-fetching.'),
      mcq('CI/CD in IoT DevOps helps to:', ['Automate building, testing and delivering updates', 'Remove the need for testing', 'Hard-code device credentials', 'Disable remote access'], 0, 'Pipelines build, test and roll out firmware and services repeatably.', 'easy'),
      fill('OTA stands for over-the-____.', 'air', 'Over-the-air (OTA) updates are delivered wirelessly.'),
    ],
  },

  MCA263D2: {
    1: [
      mcq('A single-layer perceptron cannot learn the XOR function because XOR is:', ['Not linearly separable', 'A regression problem', 'Too large a dataset', 'Non-numeric'], 0, 'A single perceptron draws one linear boundary; XOR needs a hidden layer.'),
      mcq('The back-propagation algorithm computes weight gradients using the:', ['Chain rule of differentiation', 'Fourier transform', 'Simplex method', 'Bayes theorem only'], 0, 'Errors are propagated backwards layer by layer with the chain rule.'),
      mcq('Learning with a teacher is also called:', ['Supervised learning', 'Unsupervised learning', 'Reinforcement learning', 'Clustering'], 0, 'A teacher provides the desired output for each input.', 'easy'),
      mcq('Updating the weights after every individual training example is called:', ['Sequential (online) mode', 'Batch mode', 'Early stopping', 'Annealing'], 0, 'Batch mode updates once per epoch; sequential mode updates per example.'),
      fill('In the LMS algorithm, LMS stands for least mean ____.', 'square', 'The least mean square algorithm minimises the mean squared error.'),
    ],
    2: [
      mcq('With an input width of 32, a 5 x 5 filter, stride 1 and no padding, the output width of a convolution is:', ['28', '32', '27', '30'], 0, 'Output = (32 - 5) / 1 + 1 = 28.', 'hard'),
      mcq('The ReLU activation function is defined as:', ['max(0, x)', '1 / (1 + e^-x)', 'tanh(x)', 'x squared'], 0, 'ReLU passes positive values and zeroes negative ones.', 'easy'),
      mcq('Max pooling primarily:', ['Reduces spatial size while keeping the strongest activations', 'Adds trainable parameters', 'Normalises the weights', 'Increases image resolution'], 0, 'Pooling downsamples feature maps and adds some translation invariance.'),
      mcq('Random flips, crops and rotations applied to training images are examples of:', ['Data augmentation', 'Dropout', 'Batch normalisation', 'Weight decay'], 0, 'Augmentation enlarges the effective training set to reduce overfitting.', 'easy'),
      fill('Adding zeros around the border of the input so that the output keeps the same size is called ____.', 'padding', '"Same" padding preserves spatial dimensions.'),
    ],
    3: [
      mcq('ResNet makes very deep networks trainable mainly by using:', ['Skip (residual) connections', 'Only larger filters', 'No activation functions', 'Fewer layers'], 0, 'Identity shortcuts let gradients flow through deep stacks.'),
      mcq('GoogLeNet is known for its:', ['Inception modules', 'Residual blocks', 'Recurrent layers', 'Capsules'], 0, 'Inception modules run several filter sizes in parallel.'),
      mcq('VGG networks are built mainly from stacks of:', ['3 x 3 convolution filters', '11 x 11 filters only', 'Fully connected layers only', 'Recurrent cells'], 0, 'VGG showed that depth with small 3 x 3 filters works well.'),
      mcq('Starting from a network trained on ImageNet and fine-tuning it for a new task uses:', ['Pretrained models (transfer learning)', 'Data augmentation', 'Back-propagation through time', 'Reinforcement learning'], 0, 'Pretrained features transfer well to related vision tasks.', 'easy'),
      fill('The CNN that won the ImageNet 2012 challenge and popularised deep CNNs is ____.', 'AlexNet', 'AlexNet (Krizhevsky et al., 2012) used ReLU, dropout and GPUs.', 'medium'),
    ],
    4: [
      mcq('Training an RNN by unrolling it over time steps and applying back-propagation is called:', ['Back-propagation through time', 'Truncated pooling', 'Max-margin training', 'Gradient boosting'], 0, 'BPTT treats the unrolled network as a deep feed-forward network.'),
      mcq('LSTM networks mainly address the problem of:', ['Vanishing gradients over long sequences', 'Overfitting small images', 'Too few parameters', 'Slow convolutions'], 0, 'Gated memory cells preserve information across many time steps.'),
      mcq('A GRU merges the forget and input gates of an LSTM into a single:', ['Update gate', 'Output gate', 'Pooling gate', 'Attention head'], 0, 'GRUs use update and reset gates and no separate cell state.', 'hard'),
      mcq('A bidirectional RNN processes a sequence:', ['Both forwards and backwards in time', 'Only from the last element', 'Without hidden states', 'As independent images'], 0, 'Two RNNs read the sequence in opposite directions and combine their states.', 'easy'),
      fill('LSTM stands for Long Short-Term ____.', 'Memory', 'Long Short-Term Memory networks add gated memory cells.'),
    ],
    5: [
      mcq('The central challenge in the multi-armed bandit problem is balancing:', ['Exploration and exploitation', 'Precision and recall', 'Depth and width', 'Training and inference'], 0, 'The agent must try arms to learn while exploiting the best one found so far.'),
      mcq('An epsilon-greedy strategy:', ['Takes the best-known action most of the time and a random action with probability epsilon', 'Always takes a random action', 'Always takes the best-known action', 'Never updates its estimates'], 0, 'Epsilon controls how often the agent explores.'),
      mcq('In reinforcement learning, the agent learns from:', ['Rewards received from the environment', 'Labelled input-output pairs', 'Clusters in unlabelled data', 'Fixed hand-written rules'], 0, 'Feedback comes as rewards, not as correct labels.', 'easy'),
      mcq('Upper confidence bound (UCB) methods prefer actions with:', ['A high estimated reward plus high uncertainty', 'The lowest estimated reward', 'Only the most recent reward', 'Equal probability always'], 0, 'UCB adds an exploration bonus that shrinks as an action is tried more often.', 'hard'),
      fill('In reinforcement learning, the learner that takes actions in an environment is called the ____.', 'agent', 'The agent observes states, takes actions and receives rewards.'),
    ],
  },

  MCA263D3: {
    1: [
      mcq('ICMP echo request and echo reply messages are used by the tool:', ['ping', 'nslookup', 'ftp', 'arp'], 0, 'ping sends echo requests to test whether a destination is reachable.', 'easy'),
      mcq('ICMP provides:', ['Error reporting, not error correction', 'Guaranteed delivery of datagrams', 'Encryption of datagrams', 'Exchange of routing tables'], 0, 'ICMP reports problems to the source; it does not fix them.'),
      mcq('How many usable host addresses does a /26 subnet provide?', ['62', '64', '30', '126'], 0, 'A /26 has 2^6 = 64 addresses, minus network and broadcast = 62.', 'hard'),
      mcq('Proxy ARP lets a router:', ['Answer ARP requests on behalf of hosts on another network', 'Encrypt ARP traffic', 'Assign IP addresses to hosts', 'Translate private addresses to public ones'], 0, 'The router replies with its own MAC so traffic for the remote host reaches it.'),
      fill('The subnet mask 255.255.255.0 written in CIDR notation is /____.', '24', '255.255.255.0 has 24 leading one bits.'),
    ],
    2: [
      mcq('IEEE 802.11 is the family of standards for:', ['Wireless LANs', 'Bluetooth personal area networks', 'Cellular networks', 'Wired Ethernet'], 0, '802.11 defines Wi-Fi; 802.3 is wired Ethernet.', 'easy'),
      mcq('ZigBee is built on top of which IEEE standard?', ['802.15.4', '802.3', '802.11ac', '802.16'], 0, 'ZigBee adds network and application layers to IEEE 802.15.4.'),
      mcq('Reusing the same frequencies in cells that are far enough apart is called:', ['Frequency reuse', 'Handoff', 'Roaming', 'Multiplexing'], 0, 'Frequency reuse is the core idea of the cellular concept.'),
      mcq('Splitting a congested cell into smaller cells is a technique for:', ['Capacity enhancement', 'Channel encryption', 'Error correction', 'Address translation'], 0, 'Cell splitting (like sectoring) increases capacity.'),
      fill('Bluetooth is an example of a wireless ____ area network (PAN).', 'personal', 'PAN stands for personal area network.'),
    ],
    3: [
      mcq("In Mobile IP, the router on the mobile node's home network that forwards its datagrams is the:", ['Home agent', 'Foreign agent', 'Correspondent node', 'DHCP server'], 0, 'The home agent intercepts packets for the mobile node and tunnels them to it.', 'easy'),
      mcq('The temporary address a mobile node uses while on a visited network is its:', ['Care-of address', 'Home address', 'MAC address', 'Broadcast address'], 0, 'Packets are tunnelled to the care-of address.'),
      mcq('Foreign agents announce their presence to mobile nodes using:', ['Agent advertisement messages', 'DNS queries', 'BGP updates', 'ARP replies'], 0, 'Agent advertisements (extensions of ICMP router advertisements) enable agent discovery.'),
      mcq('The two-crossing problem arises when:', ['Traffic between nearby hosts must travel to the home agent and back', 'Two agents use the same address', 'A host has two network interfaces', 'Packets cross two firewalls'], 0, 'A distant home agent makes communication with a nearby host cross the Internet twice.', 'hard'),
      fill('Mobile IP registration requests and replies are carried over UDP port ____.', '434', 'Mobile IP registration uses UDP port 434.', 'medium'),
    ],
    4: [
      mcq('BGP is used for routing:', ['Between autonomous systems', 'Within a single LAN', 'Only on wireless links', 'Between a host and its default gateway'], 0, 'BGP is the inter-domain routing protocol of the Internet.', 'easy'),
      mcq('An IPv6 address is how many bits long?', ['128', '32', '64', '256'], 0, 'IPv6 uses 128-bit addresses; IPv4 uses 32.', 'easy'),
      mcq('MPLS forwards packets based on:', ['Short fixed-length labels', 'A full destination IP lookup at every hop', 'MAC addresses only', 'TCP port numbers'], 0, 'Label switching replaces per-hop IP lookups and enables explicit routing.'),
      mcq('NAT allows:', ['Many private hosts to share one public IP address', 'IPv6 to be disabled', 'All traffic to be encrypted', 'Routing tables to be removed'], 0, 'NAT rewrites addresses (and ports) at the network edge.'),
      fill('A secure tunnel that connects a remote user or site to a private network over the Internet is a ____.', 'VPN', 'A virtual private network encrypts traffic across a public network.'),
    ],
    5: [
      mcq('Software Defined Networking separates the:', ['Control plane from the data plane', 'Physical layer from the link layer', 'TCP from UDP', 'Hosts from switches'], 0, 'SDN moves control logic out of switches into software.', 'easy'),
      mcq('In SDN, forwarding decisions are computed centrally by the:', ['Controller', 'Switch ASIC', 'End host', 'DNS server'], 0, 'The controller programs flow tables in the switches.'),
      mcq('The time it takes for all routers to agree on a consistent view after a topology change is the:', ['Convergence time', 'Latency', 'Jitter', 'Time to live'], 0, 'Fast convergence limits outages after failures.'),
      mcq('Spreading traffic across multiple paths or servers is called:', ['Load balancing', 'Fragmentation', 'Encapsulation', 'Flooding'], 0, 'Load balancing improves utilisation and availability.', 'easy'),
      fill('A widely used southbound protocol between SDN controllers and switches is ____.', 'OpenFlow', 'OpenFlow lets the controller install flow entries in switches.', 'medium'),
    ],
  },

  MCA263D4: {
    1: [
      mcq("In Garrett's Elements of User Experience, the most abstract plane, where the work starts, is the:", ['Strategy plane', 'Surface plane', 'Skeleton plane', 'Structure plane'], 0, 'The planes run strategy, scope, structure, skeleton, surface from abstract to concrete.'),
      mcq('A fictional character that represents a key group of users is a:', ['Persona', 'Wireframe', 'Style guide', 'Design comp'], 0, 'Personas summarise user research into memorable archetypes.', 'easy'),
      mcq('The scope plane defines:', ['Functional specifications and content requirements', 'Colours and typography', 'Navigation menus', 'Server hardware'], 0, 'Scope turns strategy into specific features and content.'),
      mcq('Dividing users into groups with shared characteristics is called:', ['User segmentation', 'A/B testing', 'Information architecture', 'Wireframing'], 0, 'Segments help address the different needs of different users.'),
      fill("The number of planes in Garrett's Elements of User Experience model is ____.", '5', 'Strategy, scope, structure, skeleton and surface.'),
    ],
    2: [
      mcq('Information architecture is part of the:', ['Structure plane', 'Surface plane', 'Strategy plane', 'Scope plane'], 0, 'Structure covers interaction design and information architecture.'),
      mcq('Wireframes belong to the:', ['Skeleton plane', 'Strategy plane', 'Scope plane', 'Surface plane'], 0, 'The skeleton plane covers interface, navigation and information design, documented as wireframes.'),
      mcq('Colour palettes and typography are decided on the:', ['Surface plane', 'Scope plane', 'Strategy plane', 'Structure plane'], 0, 'The surface plane is the sensory design layer.', 'easy'),
      mcq('Using the same terms and controls throughout one product is called:', ['Internal consistency', 'External consistency', 'Contrast', 'Error handling'], 0, 'External consistency means matching conventions of other products.'),
      fill('A low-fidelity layout that shows the arrangement of interface elements without visual design is a ____.', 'wireframe', 'Wireframes document the skeleton of a screen.'),
    ],
    3: [
      mcq('Which of these is a common usability measure?', ['Time to learn', 'Lines of code', 'Server uptime', 'Number of developers'], 0, 'Shneiderman lists time to learn, speed, error rate, retention and satisfaction.', 'easy'),
      mcq('Participatory design means:', ['Involving users directly in the design process', 'Designing only with developers', 'Copying competitor designs', 'Skipping prototypes'], 0, 'Users contribute to design decisions alongside designers.'),
      mcq("Observing users in their natural work environment is:", ['Ethnographic observation', 'A controlled experiment', 'An expert review', 'A survey'], 0, 'Ethnographic observation reveals real practices and context.'),
      mcq('Universal usability aims to:', ['Make systems usable by diverse users, including people with disabilities', 'Support only expert users', 'Support a single screen size', 'Remove accessibility settings'], 0, 'It accounts for differences in ability, experience, devices and culture.'),
      fill("Shneiderman's eight ____ rules are well-known principles of interface design.", 'golden', 'The Eight Golden Rules include consistency, informative feedback and error prevention.'),
    ],
    4: [
      mcq('An expert review in which specialists check an interface against usability principles is a:', ['Heuristic evaluation', 'Acceptance test', 'Controlled experiment', 'Field survey'], 0, 'Heuristic evaluation is a fast, inexpensive expert review method.'),
      mcq('Acceptance tests check whether:', ['The interface meets measurable requirements agreed with the client', 'The code compiles', 'The server scales', 'The colours are attractive'], 0, 'They use measurable criteria such as task time and error rate.'),
      mcq('For a long list of options on a small display, a good approach is:', ['A scrolling or hierarchical menu', 'A single row of tiny buttons', 'Hiding the options', 'Free-text input only'], 0, 'Hierarchical or scrolling menus fit long lists into small screens.'),
      mcq("Questionnaires used to gather users' subjective satisfaction are:", ['Survey instruments', 'Wireframes', 'Personas', 'Style guides'], 0, 'Surveys complement observation with users\' opinions.', 'easy'),
      fill('Watching real users perform tasks with an interface while recording problems is called usability ____.', 'testing', 'Usability testing is often run in a usability laboratory.'),
    ],
    5: [
      mcq('Placing the primary navigation in a bar at the bottom of a mobile screen is the pattern called:', ['Bottom Navigation', 'Vertical Stack', 'Deep Background', 'Content Leaderboard'], 0, 'Bottom navigation keeps key destinations within thumb reach.', 'easy'),
      mcq('A spinner or progress bar shown while content loads is the pattern:', ['Loading Indicators', 'Touch Tools', 'Sharing Widget', 'Editorial Mix'], 0, 'Loading indicators give feedback during waits.', 'easy'),
      mcq('Interface designs that trick users into actions they did not intend are called:', ['Dark patterns', 'Design comps', 'Style guides', 'Personas'], 0, 'Examples include hidden costs and forced continuity.'),
      mcq('The "Few Hues, Many Values" pattern recommends:', ['Using a small set of colours in many shades', 'Using every colour of the spectrum', 'Using only grey', 'Changing colours on every page'], 0, 'A limited palette with varied lightness looks cohesive.'),
      fill('Arranging content in a single scrolling column on a phone is the Vertical ____ pattern.', 'Stack', 'Vertical Stack is a basic mobile layout pattern.'),
    ],
  },
};
