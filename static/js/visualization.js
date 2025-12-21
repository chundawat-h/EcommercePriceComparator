document.addEventListener('DOMContentLoaded', function() {
    // Get product data from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const productData = urlParams.get('product_data');
    
    if (!productData) {
        showError('No product data provided. Please select a product from the comparison page.');
        return;
    }
    
    try {
        // Decode and parse the product data
        const decodedData = JSON.parse(decodeURIComponent(productData));
        displayProductDetails(decodedData);
    } catch (e) {
        showError(`Error parsing product data: ${e.message}`);
    }
});

function displayProductDetails(data) {
    // Log the data received for debugging
    console.log("Visualization data received:", JSON.stringify(data, null, 2));
    
    // Hide loading and show product details
    document.getElementById('loading-indicator').style.display = 'none';
    document.getElementById('product-details-container').style.display = 'block';
    
    // Added more detailed debugging for the product data
    console.log("Amazon product:", data.amazon_product);
    console.log("Flipkart product:", data.flipkart_product);
    console.log("Better platform:", data.better_platform);
    
    // Determine which product to show as the main product (prefer Amazon if both available)
    const mainProduct = data.amazon_product || data.flipkart_product;
    
    if (!mainProduct) {
        showError("Product data is incomplete. Please go back and try again.");
        return;
    }
    
    // Save the product to the database for price history tracking
    saveProductPrice(mainProduct);
    
    // Clean product name (especially for Flipkart which has excessive details)
    let productName = mainProduct.name;
    
    // If it's a Flipkart product, clean up the name 
    if (mainProduct.source === 'flipkart') {
        // Remove everything after ratings text for Flipkart products
        const ratingsIndex = productName.indexOf('ratings &');
        if (ratingsIndex > -1) {
            productName = productName.substring(0, ratingsIndex).trim();
        }
        
        // Remove numbers at the beginning like "1." or "2."
        productName = productName.replace(/^\d+\.\s*/g, '');
    }
    
    document.getElementById('product-name-display').textContent = productName;
    document.getElementById('product-name').textContent = productName;
    
    // Set product image
    const imgElement = document.getElementById('product-image');
    
    // Check if image URL is valid (not data:image/svg+xml)
    if (mainProduct.image_url && !mainProduct.image_url.startsWith('data:image/svg+xml')) {
        imgElement.src = mainProduct.image_url;
    } else {
        // Use a placeholder image if the URL is invalid or a data URI
        imgElement.src = 'https://via.placeholder.com/300x300?text=No+Image+Available';
        console.log("Using placeholder image - invalid image URL:", mainProduct.image_url);
    }
    
    imgElement.alt = productName;
    
    // Set product price
    const displayPrice = data.amazon_product ? 
        `₹${data.amazon_product.price}` : 
        data.flipkart_product.price;
    document.getElementById('product-price').textContent = displayPrice;
    
    // Parse and set rating
    let displayRating = 'N/A';
    if (data.amazon_product && data.amazon_product.rating) {
        displayRating = parseRating(data.amazon_product.rating);
    } else if (data.flipkart_product && data.flipkart_product.rating) {
        displayRating = parseRating(data.flipkart_product.rating);
    }
    
    if (displayRating !== 'N/A') {
        document.getElementById('product-rating').textContent = displayRating + '★';
    } else {
        document.getElementById('product-rating').textContent = 'No rating';
    }
    
    // Set availability badges
    const availabilityContainer = document.getElementById('availability-badges');
    
    if (data.amazon_product && data.flipkart_product) {
        availabilityContainer.innerHTML = `
            <span class="badge bg-info me-2">Amazon</span>
            <span class="badge bg-warning">Flipkart</span>
        `;
    } else if (data.amazon_product) {
        availabilityContainer.innerHTML = `
            <span class="badge bg-info">Amazon only</span>
        `;
    } else if (data.flipkart_product) {
        availabilityContainer.innerHTML = `
            <span class="badge bg-warning">Flipkart only</span>
        `;
    }
    
    // Set product links
    const linksContainer = document.getElementById('product-links');
    linksContainer.innerHTML = '';
    
    if (data.amazon_product) {
        const amazonLink = document.createElement('a');
        amazonLink.href = data.amazon_product.url;
        amazonLink.target = '_blank';
        amazonLink.className = 'btn btn-outline-info me-2';
        amazonLink.innerHTML = '<i class="bi bi-box-arrow-up-right me-1"></i> View on Amazon';
        linksContainer.appendChild(amazonLink);
    }
    
    if (data.flipkart_product) {
        const flipkartLink = document.createElement('a');
        flipkartLink.href = data.flipkart_product.url;
        flipkartLink.target = '_blank';
        flipkartLink.className = 'btn btn-outline-warning';
        flipkartLink.innerHTML = '<i class="bi bi-box-arrow-up-right me-1"></i> View on Flipkart';
        linksContainer.appendChild(flipkartLink);
    }
    
    // Set recommendation
    const recommendationCard = document.getElementById('recommendation-card');
    
    if (data.amazon_product && data.flipkart_product) {
        if (data.better_platform) {
            const platform = data.better_platform === 'amazon' ? 'Amazon' : 'Flipkart';
            const badgeClass = data.better_platform === 'amazon' ? 'bg-info' : 'bg-warning';
            
            recommendationCard.innerHTML = `
                <div class="p-3 ${data.better_platform === 'amazon' ? 'bg-info bg-opacity-10' : 'bg-warning bg-opacity-10'} rounded">
                    <div class="d-flex align-items-center mb-2">
                        <span class="badge ${badgeClass} p-2 me-2">${platform}</span>
                        <span class="fw-bold">is recommended</span>
                    </div>
                    <p class="mb-0">${data.reason}</p>
                </div>
            `;
        } else {
            recommendationCard.innerHTML = `
                <div class="p-3 bg-secondary bg-opacity-10 rounded">
                    <p class="mb-0">Both platforms offer similar value for this product.</p>
                </div>
            `;
        }
    } else if (data.amazon_product) {
        recommendationCard.innerHTML = `
            <div class="p-3 bg-info bg-opacity-10 rounded">
                <div class="d-flex align-items-center mb-2">
                    <span class="badge bg-info p-2 me-2">Amazon</span>
                    <span class="fw-bold">is the only option</span>
                </div>
                <p class="mb-0">This product is only available on Amazon.</p>
            </div>
        `;
    } else if (data.flipkart_product) {
        recommendationCard.innerHTML = `
            <div class="p-3 bg-warning bg-opacity-10 rounded">
                <div class="d-flex align-items-center mb-2">
                    <span class="badge bg-warning p-2 me-2">Flipkart</span>
                    <span class="fw-bold">is the only option</span>
                </div>
                <p class="mb-0">This product is only available on Flipkart.</p>
            </div>
        `;
    }
    
    // Fill comparison table
    fillComparisonTable(data);
    
    // Load price history data
    loadPriceHistory(mainProduct.url);
}

function fillComparisonTable(data) {
    // Amazon cells
    if (data.amazon_product) {
        const amazonProduct = data.amazon_product;
        const amazonRating = parseRating(amazonProduct.rating);
        
        document.getElementById('amazon-price-cell').textContent = `₹${amazonProduct.price}`;
        document.getElementById('amazon-rating-cell').innerHTML = 
            `<span class="badge bg-success p-2">${amazonRating !== 'N/A' ? amazonRating + '★' : 'N/A'}</span>`;
        document.getElementById('amazon-link-cell').innerHTML = 
            `<a href="${amazonProduct.url}" target="_blank" class="btn btn-sm btn-outline-info">View</a>`;
    } else {
        document.getElementById('amazon-price-cell').textContent = 'Not available';
        document.getElementById('amazon-rating-cell').textContent = 'Not available';
        document.getElementById('amazon-link-cell').textContent = 'Not available';
    }
    
    // Flipkart cells
    if (data.flipkart_product) {
        const flipkartProduct = data.flipkart_product;
        const flipkartRating = parseRating(flipkartProduct.rating);
        
        document.getElementById('flipkart-price-cell').textContent = flipkartProduct.price;
        document.getElementById('flipkart-rating-cell').innerHTML = 
            `<span class="badge bg-success p-2">${flipkartRating !== 'N/A' ? flipkartRating + '★' : 'N/A'}</span>`;
        document.getElementById('flipkart-link-cell').innerHTML = 
            `<a href="${flipkartProduct.url}" target="_blank" class="btn btn-sm btn-outline-warning">View</a>`;
    } else {
        document.getElementById('flipkart-price-cell').textContent = 'Not available';
        document.getElementById('flipkart-rating-cell').textContent = 'Not available';
        document.getElementById('flipkart-link-cell').textContent = 'Not available';
    }
}

// Helper function to parse rating values
function parseRating(ratingText) {
    if (!ratingText || ratingText === 'N/A' || ratingText === 'Rating not available') {
        return 'N/A';
    }
    
    try {
        if (typeof ratingText === 'number') {
            return ratingText.toFixed(1);
        }
        
        if (typeof ratingText === 'string') {
            // Try to extract numeric part using regex
            const match = ratingText.match(/\d+(\.\d+)?/);
            if (match) {
                const rating = parseFloat(match[0]);
                return isNaN(rating) ? 'N/A' : rating.toFixed(1);
            }
        }
    } catch (e) {
        console.error("Error parsing rating:", e);
    }
    
    return 'N/A';
}

// Global variables for price history chart
let priceHistoryChart = null;
let priceHistoryData = [];

// Save product price to the database
function saveProductPrice(product) {
    fetch('/api/save-price', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            name: product.name,
            price: product.price,
            platform: product.source,
            url: product.url
        })
    })
    .then(response => response.json())
    .then(data => {
        console.log('Price saved:', data);
    })
    .catch(error => {
        console.error('Error saving price:', error);
    });
}

// Load price history data for a product
function loadPriceHistory(productUrl) {
    // Show loading spinner
    document.getElementById('price-history-loading').style.display = 'block';
    document.getElementById('price-history-container').style.display = 'none';
    document.getElementById('price-history-empty').style.display = 'none';
    
    fetch(`/api/price-history?url=${encodeURIComponent(productUrl)}`)
        .then(response => response.json())
        .then(data => {
            console.log('Price history data:', data);
            
            if (data.product && data.history && data.history.length > 0) {
                priceHistoryData = data.history;
                
                // Show price history container
                document.getElementById('price-history-loading').style.display = 'none';
                document.getElementById('price-history-container').style.display = 'block';
                
                // Render the chart
                renderPriceHistoryChart(data.history);
                
                // Calculate and display stats
                displayPriceHistoryStats(data.history);
            } else {
                // No price history available
                document.getElementById('price-history-loading').style.display = 'none';
                document.getElementById('price-history-empty').style.display = 'block';
            }
        })
        .catch(error => {
            console.error('Error loading price history:', error);
            document.getElementById('price-history-loading').style.display = 'none';
            document.getElementById('price-history-empty').style.display = 'block';
            document.getElementById('price-history-empty').innerHTML = 
                `<p class="text-danger">Error loading price history: ${error.message}</p>`;
        });
}

// Render price history chart
function renderPriceHistoryChart(historyData, startDate = null, endDate = null) {
    // If start and end dates are provided, filter the data
    let filteredData = historyData;
    if (startDate && endDate) {
        filteredData = historyData.filter(item => {
            const itemDate = new Date(item.date);
            return itemDate >= startDate && itemDate <= endDate;
        });
    }
    
    // Prepare chart data
    const dates = filteredData.map(item => item.date);
    const prices = filteredData.map(item => item.price);
    
    // Get canvas element
    const ctx = document.getElementById('price-history-chart').getContext('2d');
    
    // Destroy previous chart if it exists
    if (priceHistoryChart) {
        priceHistoryChart.destroy();
    }
    
    // Create new chart
    priceHistoryChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates,
            datasets: [{
                label: 'Price (₹)',
                data: prices,
                borderColor: 'rgb(75, 192, 192)',
                backgroundColor: 'rgba(75, 192, 192, 0.2)',
                borderWidth: 2,
                tension: 0.3,
                pointRadius: 3,
                pointHoverRadius: 5,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `Price: ₹${context.raw.toLocaleString('en-IN', {
                                maximumFractionDigits: 2,
                                minimumFractionDigits: 2
                            })}`;
                        }
                    }
                },
                legend: {
                    display: false
                },
                title: {
                    display: true,
                    text: 'Price History Timeline',
                    font: {
                        size: 16
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        maxRotation: 45,
                        minRotation: 45
                    }
                },
                y: {
                    beginAtZero: false,
                    grid: {
                        color: 'rgba(200, 200, 200, 0.2)'
                    },
                    ticks: {
                        callback: function(value) {
                            return '₹' + value.toLocaleString('en-IN');
                        }
                    }
                }
            },
            animation: {
                duration: 1000,
                easing: 'easeOutQuart'
            },
            interaction: {
                mode: 'index',
                intersect: false
            },
            hover: {
                mode: 'nearest',
                intersect: true
            }
        }
    });
}

// Display price history statistics
function displayPriceHistoryStats(historyData) {
    if (!historyData || historyData.length === 0) return;
    
    // Calculate stats
    const prices = historyData.map(item => item.price);
    const lowestPrice = Math.min(...prices);
    const highestPrice = Math.max(...prices);
    const sum = prices.reduce((a, b) => a + b, 0);
    const avgPrice = sum / prices.length;
    
    // Display stats
    document.getElementById('lowest-price').textContent = `₹${lowestPrice.toLocaleString('en-IN', {
        maximumFractionDigits: 2,
        minimumFractionDigits: 2
    })}`;
    
    document.getElementById('highest-price').textContent = `₹${highestPrice.toLocaleString('en-IN', {
        maximumFractionDigits: 2,
        minimumFractionDigits: 2
    })}`;
    
    document.getElementById('average-price').textContent = `₹${avgPrice.toLocaleString('en-IN', {
        maximumFractionDigits: 2,
        minimumFractionDigits: 2
    })}`;
}

// Set up chart zoom buttons
document.addEventListener('DOMContentLoaded', function() {
    // 1 Month zoom
    document.getElementById('zoom-1m').addEventListener('click', function() {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setMonth(endDate.getMonth() - 1);
        renderPriceHistoryChart(priceHistoryData, startDate, endDate);
    });
    
    // 3 Month zoom
    document.getElementById('zoom-3m').addEventListener('click', function() {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setMonth(endDate.getMonth() - 3);
        renderPriceHistoryChart(priceHistoryData, startDate, endDate);
    });
    
    // All time zoom
    document.getElementById('zoom-all').addEventListener('click', function() {
        renderPriceHistoryChart(priceHistoryData);
    });
});

function showError(message) {
    document.getElementById('loading-indicator').style.display = 'none';
    const errorContainer = document.getElementById('error-container');
    errorContainer.style.display = 'block';
    errorContainer.innerHTML = `
        <div class="alert alert-danger">
            ${message}
            <div class="mt-3">
                <a href="javascript:history.back()" class="btn btn-primary">Back to Comparison</a>
                <a href="/" class="btn btn-secondary ms-2">Return to Home</a>
            </div>
        </div>
    `;
}
